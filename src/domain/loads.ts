/* 하중 케이스·하중·하중조합 → Gen NX 페이로드 (순수 함수). 단위 kN, m.
   케이스: D(자중+마감) · LR(지붕 활하중) · EX/EY(정적 등가 지진)
           WX1~4(횡방향 풍 +X: 지붕 풍상 Cp high/low × ±GCpi) · WY1~2(종방향 풍 +Y: ±GCpi).
   벽 하중은 거트(측벽·박공벽)와 처마 스트럿, 박공 상부(최상단 거트 위 반 칸 + 삼각부)는 박공 지붕보에 재하.
   반대 방향 풍(−X·−Y)은 대칭 구조라 미러 결과로 대체. 미구현: 우발편심(2.14)·수직지진(2.18). */
import { profileOf } from '../codes'
import type { LoadCaseType } from '../codes'
import { portalGeometry } from './portal'
import type { Face, FactoryModel, FactorySpec, Node } from './types'
import { nodeWeights } from './weights'

export interface LoadInfo {
  /** 지붕 활하중 (kN/m², 수평투영) */
  roofLive: number
  seismic: Record<'X' | 'Y', { T: number; c: number; cStar: number; gov: string; V: number }> & { W: number }
  wind: { qh: number; hRef: number; cases: { name: string; dir: 'X' | 'Y'; roofCp: number; gcpi: number }[]; windwardRoofCp: { low: number; high: number } }
}

export interface LoadPayloads {
  STLD: Record<string, unknown>
  BODF: Record<string, unknown>
  BMLD: Record<string, unknown>
  CNLD: Record<string, unknown>
  'LCOM-GEN': Record<string, unknown>
  info: LoadInfo
}

type Dir = 'GX' | 'GY' | 'GZ'
interface Variant { name: string; sign: 1 | -1; tag: string }

/** 벽 바깥 법선 (단위 벡터, x·y 성분) */
const OUT: Record<Exclude<Face, 'roof'>, [number, number]> = { x0: [-1, 0], xL: [1, 0], y0: [0, -1], yL: [0, 1] }

export function buildLoadPayloads(spec: FactorySpec, model: FactoryModel): LoadPayloads {
  const prof = profileOf(spec.code)
  const lat = prof.lateral
  const { span, eaveHeight, roofSlope, baySpacing } = spec
  const G = portalGeometry(spec)
  const { sRoof, gWall, theta, length } = G
  const cosT = Math.cos(theta), sinT = Math.sin(theta)
  const nodeById = new Map(model.nodes.map((n) => [n.id, n]))
  const ends = (id: number): [Node, Node] => { const e = model.elements[id - 1]; return [nodeById.get(e.n1)!, nodeById.get(e.n2)!] }
  /** 박공 지붕보 요소 — y 가 0 또는 길이 */
  const gableOf = (a: Node): 'y0' | 'yL' | null => (a.y === 0 ? 'y0' : Math.abs(a.y - length) < 1e-9 ? 'yL' : null)
  /** 박공 상부 띠 높이 — 최상단 거트가 위로 반 칸(gWall/2)을 받으므로 그 위부터 지붕선까지. 요소 중점 x 기준 */
  const topGirt = G.girtZs.length ? G.girtZs[G.girtZs.length - 1] : 0
  const stripH = (x: number) => Math.max(0, G.zAt(x) - topGirt - gWall / 2)

  /* ── 보하중 누적 ── */
  const BMLD: Record<string, { ITEMS: unknown[] }> = {}
  const deadLine = new Map<number, number>() // 요소별 마감 고정하중 kN/m (지진 무게용)
  const addLine = (elemId: number, lc: string, dir: Dir, w: number) => {
    if (Math.abs(w) < 1e-9) return
    const items = (BMLD[elemId] ??= { ITEMS: [] }).ITEMS
    items.push({
      ID: items.length + 1, LCNAME: lc, GROUP_NAME: '', CMD: 'BEAM', TYPE: 'UNILOAD', DIRECTION: dir,
      USE_PROJECTION: false, USE_ECCEN: false, D: [0, 1, 0, 0], P: [w, w, 0, 0],
    })
  }
  const addDead = (id: number, w: number) => { addLine(id, 'D', 'GZ', -w); deadLine.set(id, (deadLine.get(id) ?? 0) + w) }

  /* ── 중력: D, LR ── */
  const qLive = prof.roofLive({ slope: roofSlope, tribArea: baySpacing * sRoof * cosT })
  for (const e of model.elements) {
    const [a, b] = ends(e.id)
    if (e.role === 'girt') { addDead(e.id, spec.wallDead * gWall); continue }
    if (e.role === 'rafter') {
      const g = gableOf(a)
      if (g) addDead(e.id, spec.wallDead * stripH((a.x + b.x) / 2)) // 박공 상부 벽 → 박공 지붕보
      continue
    }
    if (e.role !== 'purlin' && e.role !== 'strut') continue
    /* 지붕: 처마 스트럿 = 반 간격 + 측벽 반 칸, 마루 스트럿 = 양쪽 반 간격 = 1 간격, 퍼린 = 1 간격 */
    const eave = a.x === 0 || a.x === span
    const sTrib = eave ? sRoof / 2 : sRoof
    addDead(e.id, spec.roofDead * sTrib + (eave ? spec.wallDead * (gWall / 2) : 0))
    addLine(e.id, 'LR', 'GZ', -(qLive * sTrib * cosT))
  }

  /* ── 지진: 절점 무게 × 높이 분배 (2.11), 단일 층이므로 Ft 는 T > 0.7s 일 때만 ── */
  const W = nodeWeights(spec, model, (id) => deadLine.get(id) ?? 0)
  const Wtot = [...W.values()].reduce((x, y) => x + y, 0)
  const hn = eaveHeight + G.rise / 2 // 기면~평균 지붕면
  const si = spec.seismic
  const CNLD: Record<string, { ITEMS: unknown[] }> = {}
  const seismic = { W: Wtot } as LoadInfo['seismic']
  let denom = 0
  for (const n of model.nodes) denom += (W.get(n.id) ?? 0) * n.z
  const zTop = Math.max(...model.nodes.map((n) => n.z))
  const topW = model.nodes.filter((n) => n.z === zTop).reduce((x, n) => x + (W.get(n.id) ?? 0), 0)
  for (const dir of ['X', 'Y'] as const) {
    const T = lat.period(dir === 'X' ? 'moment' : 'braced', hn)
    const cf = lat.seismicCoef({ SDS: si.SDS, SD1: si.SD1, I: si.I, R: dir === 'X' ? si.Rx : si.Ry, T })
    const V = cf.c * Wtot
    const Ft = T > 0.7 ? Math.min(0.07 * T * V, 0.25 * V) : 0
    for (const n of model.nodes) {
      const w = W.get(n.id) ?? 0
      let F = denom > 0 ? ((V - Ft) * w * n.z) / denom : 0
      if (Ft > 0 && n.z === zTop && topW > 0) F += (Ft * w) / topW
      if (F === 0) continue
      const items = (CNLD[n.id] ??= { ITEMS: [] }).ITEMS
      items.push({ ID: items.length + 1, LCNAME: `E${dir}`, GROUP_NAME: '', FX: dir === 'X' ? F : 0, FY: dir === 'Y' ? F : 0, FZ: 0, MX: 0, MY: 0, MZ: 0 })
    }
    /* cStar 는 I = 1.0 으로 재계산 (2.16.1 — 용도계수 > 1 건물도 I = 1 로 변위 산정 가능) */
    const cStar1 = lat.seismicCoef({ SDS: si.SDS, SD1: si.SD1, I: 1.0, R: dir === 'X' ? si.Rx : si.Ry, T }).cStar
    seismic[dir] = { T, c: cf.c, cStar: cStar1, gov: cf.gov, V }
  }

  /* ── 풍. 封閉/部分封閉 건물 MWFRS p = q·G·Cp − q_i·(GCpi) (風力規範 2.2), p > 0 = 면을 향하는 압력 ── */
  const wi = spec.wind
  const hRef = theta < (10 * Math.PI) / 180 ? eaveHeight : eaveHeight + G.rise / 2 // 風力規範 符號 h
  const qOf = (z: number) => lat.windQ(z, { V10: wi.V10, I: wi.I, exposure: wi.exposure })
  const qh = qOf(hRef)
  const Gf = lat.gust
  const gpi = lat.gcpi(wi.enclosure)
  const rc = lat.roofCp({ thetaDeg: (theta * 180) / Math.PI, hOverL: hRef / span })
  const SIDE_CP = -0.7 // 표2.4 측풍면
  const ROOF_PARALLEL_CP = Math.max(hRef / span, hRef / length) <= 2.5 ? -0.7 : -0.8 // 표2.5 풍향 ∥ 용마루

  interface WindCase { name: string; dir: 'X' | 'Y'; s: 1 | -1; roofW: number; roofL: number }
  const windCases: WindCase[] = [
    { name: 'WX1', dir: 'X', s: 1, roofW: rc.high, roofL: rc.leeward }, { name: 'WX2', dir: 'X', s: -1, roofW: rc.high, roofL: rc.leeward },
    { name: 'WX3', dir: 'X', s: 1, roofW: rc.low, roofL: rc.leeward }, { name: 'WX4', dir: 'X', s: -1, roofW: rc.low, roofL: rc.leeward },
    { name: 'WY1', dir: 'Y', s: 1, roofW: ROOF_PARALLEL_CP, roofL: ROOF_PARALLEL_CP }, { name: 'WY2', dir: 'Y', s: -1, roofW: ROOF_PARALLEL_CP, roofL: ROOF_PARALLEL_CP },
  ]
  for (const wc of windCases) {
    const pi = qh * wc.s * gpi
    /** 벽면 순압력 p(z) — 풍상벽 0.8·q(z), 풍하벽 Cp(L/B)·q(h), 측벽 −0.7·q(h) */
    const wallP = (face: Exclude<Face, 'roof'>, z: number): number => {
      const windward = wc.dir === 'X' ? 'x0' : 'y0'
      const leeward = wc.dir === 'X' ? 'xL' : 'yL'
      const LB = wc.dir === 'X' ? span / length : length / span // L = 풍향 평행, B = 직각
      if (face === windward) return qOf(z) * Gf * lat.wallCp.windward - pi
      if (face === leeward) return qh * Gf * lat.wallCp.leeward(LB) - pi
      return qh * Gf * SIDE_CP - pi
    }
    /** 벽 하중 (kN/m) → 전역 성분: 힘 = p × 폭 × (−바깥 법선) */
    const wallForce = (id: number, face: Exclude<Face, 'roof'>, z: number, trib: number) => {
      const f = wallP(face, z) * trib
      const [ox, oy] = OUT[face]
      addLine(id, wc.name, 'GX', -f * ox)
      addLine(id, wc.name, 'GY', -f * oy)
    }
    for (const e of model.elements) {
      const [a, b] = ends(e.id)
      if (e.role === 'girt' && e.face && e.face !== 'roof') { wallForce(e.id, e.face, a.z, gWall); continue }
      if (e.role === 'rafter') {
        const g = gableOf(a)
        if (g) wallForce(e.id, g, (a.z + b.z) / 2, stripH((a.x + b.x) / 2))
        continue
      }
      if (e.role !== 'purlin' && e.role !== 'strut') continue
      /* 지붕 — 풍상 경사면(x < 스팬/2) 법선 (−sinθ, 0, cosθ), 풍하 (sinθ, 0, cosθ). 힘 = p·s·(−법선) */
      const pW = qh * Gf * wc.roofW - pi, pL = qh * Gf * wc.roofL - pi
      let fx = 0, fz = 0
      const roofW = (s: number) => { fx += pW * s * sinT; fz += -pW * s * cosT }
      const roofL = (s: number) => { fx += -pL * s * sinT; fz += -pL * s * cosT }
      const x = a.x
      if (x === 0) { roofW(sRoof / 2); const f = wallP('x0', eaveHeight) * (gWall / 2); fx += f }
      else if (x === span) { roofL(sRoof / 2); const f = wallP('xL', eaveHeight) * (gWall / 2); fx += -f }
      else if (Math.abs(x - span / 2) < 1e-9) { roofW(sRoof / 2); roofL(sRoof / 2) }
      else if (x < span / 2) roofW(sRoof)
      else roofL(sRoof)
      addLine(e.id, wc.name, 'GX', fx)
      addLine(e.id, wc.name, 'GZ', fz)
    }
  }

  /* ── 하중조합: 종류별 변형 전개 (E 는 ±, W 는 케이스 자체가 방향·내압 변형) ── */
  const variants: Record<LoadCaseType, Variant[]> = {
    D: [{ name: 'D', sign: 1, tag: '' }],
    L: [{ name: 'LR', sign: 1, tag: '' }],
    W: windCases.map((v) => ({ name: v.name, sign: 1 as const, tag: ` ${v.name}` })),
    E: (['EX', 'EY'] as const).flatMap((n) => [
      { name: n, sign: 1 as const, tag: ` +${n}` },
      { name: n, sign: -1 as const, tag: ` -${n}` },
    ]),
  }
  const LCOM: Record<string, unknown> = {}
  let no = 0
  for (const c of prof.combos({ heavyLive: false })) {
    const wOrE = c.terms.map(([k]) => k).find((k) => k === 'W' || k === 'E')
    for (const v of wOrE ? variants[wOrE] : [null]) {
      no++
      LCOM[no] = {
        NAME: `${prof.method} ${c.ref}${v?.tag ?? ''}`, ACTIVE: 'ACTIVE', iTYPE: 0,
        DESC: c.terms.map(([k, f]) => `${f}${k}`).join('+'),
        vCOMB: c.terms.map(([k, f]) => {
          const vv = k === 'W' || k === 'E' ? v! : variants[k][0]
          return { ANAL: 'ST', LCNAME: vv.name, FACTOR: f * vv.sign }
        }),
      }
    }
  }

  const STLD: Record<string, unknown> = {}
  const cases: [string, string, string][] = [
    ['D', 'D', 'Dead'], ['LR', 'LR', 'Roof live'], ['EX', 'E', 'Seismic X'], ['EY', 'E', 'Seismic Y'],
    ...windCases.map((v): [string, string, string] => [v.name, 'W', `Wind ${v.dir}`]),
  ]
  cases.forEach(([name, type, desc], i) => { STLD[i + 1] = { NAME: name, TYPE: type, DESC: desc } })

  return {
    STLD,
    BODF: { 1: { LCNAME: 'D', GROUP_NAME: '', FV: [0, 0, -1] } },
    BMLD,
    CNLD,
    'LCOM-GEN': LCOM,
    info: {
      roofLive: qLive, seismic,
      wind: { qh, hRef, cases: windCases.map((v) => ({ name: v.name, dir: v.dir, roofCp: v.roofW, gcpi: v.s * gpi })), windwardRoofCp: { low: rc.low, high: rc.high } },
    },
  }
}
