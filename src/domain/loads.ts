/* 하중 케이스·하중·하중조합 → Gen NX 페이로드 (순수 함수). 단위 kN, m.
   케이스: D(자중+마감) · LR(지붕 활하중) · EX/EY(정적 등가 지진) · WX1~4(횡방향 풍, 용마루에 수직).
   미구현: 종방향 풍(용마루 평행)·우발편심·수직지진·눈 — 종방향 가새(X-bracing) 모델링 후 추가. */
import { profileOf } from '../codes'
import type { LoadCaseType } from '../codes'
import type { FactoryModel, FactorySpec } from './types'
import { nodeWeights } from './weights'

export interface LoadInfo {
  /** 지붕 활하중 (kN/m², 수평투영) */
  roofLive: number
  seismic: Record<'X' | 'Y', { T: number; c: number; gov: string; V: number }> & { W: number }
  wind: { qh: number; hRef: number; cases: { name: string; roofCp: number; gcpi: number }[]; windwardRoofCp: { low: number; high: number } }
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

export function buildLoadPayloads(spec: FactorySpec, model: FactoryModel): LoadPayloads {
  const prof = profileOf(spec.code)
  const lat = prof.lateral
  const { span, eaveHeight, roofSlope, baySpacing, bays, purlinSpacing, girtSpacing } = spec

  /* 실제 2차부재 간격 (buildPortal 이 등분하므로 요청 간격과 다를 수 있음) */
  const rise = (span / 2) * roofSlope
  const slopeLen = Math.hypot(span / 2, rise)
  const nPurlin = Math.max(1, Math.round(slopeLen / purlinSpacing))
  const sRoof = slopeLen / nPurlin // 경사 방향 간격
  const theta = Math.atan(roofSlope)
  const cosT = Math.cos(theta), sinT = Math.sin(theta)
  const gWall = eaveHeight / Math.max(1, Math.round(eaveHeight / girtSpacing))
  const length = bays * baySpacing

  const nodeById = new Map(model.nodes.map((n) => [n.id, n]))

  /* ── 보하중 누적 ── */
  const BMLD: Record<string, { ITEMS: unknown[] }> = {}
  const deadLine = new Map<number, number>() // 요소별 마감 고정하중 kN/m (지진 무게용)
  const addLine = (elemId: number, lc: string, dir: Dir, w: number) => {
    if (w === 0) return
    const items = (BMLD[elemId] ??= { ITEMS: [] }).ITEMS
    items.push({
      ID: items.length + 1, LCNAME: lc, GROUP_NAME: '', CMD: 'BEAM', TYPE: 'UNILOAD', DIRECTION: dir,
      USE_PROJECTION: false, USE_ECCEN: false, D: [0, 1, 0, 0], P: [w, w, 0, 0],
    })
  }

  /* ── 중력: D, LR ── */
  const qLive = prof.roofLive({ slope: roofSlope, tribArea: baySpacing * sRoof * cosT })
  for (const e of model.elements) {
    if (e.role !== 'purlin' && e.role !== 'strut' && e.role !== 'girt') continue
    const x = nodeById.get(e.n1)!.x
    if (e.role === 'girt') {
      const w = spec.wallDead * gWall
      addLine(e.id, 'D', 'GZ', -w)
      deadLine.set(e.id, w)
      continue
    }
    /* 지붕: 처마 스트럿 = 반 간격 + 벽 반 간격, 마루 스트럿 = 양쪽 반 간격 = 1 간격, 퍼린 = 1 간격 */
    const eave = x === 0 || x === span
    const sTrib = eave ? sRoof / 2 : sRoof
    const wD = spec.roofDead * sTrib + (eave ? spec.wallDead * (gWall / 2) : 0)
    addLine(e.id, 'D', 'GZ', -wD)
    deadLine.set(e.id, wD)
    addLine(e.id, 'LR', 'GZ', -(qLive * sTrib * cosT))
  }

  /* ── 지진: 절점 무게 × 높이 분배 (2.11), 단일 층이므로 Ft 는 T > 0.7s 일 때만 ── */
  const W = nodeWeights(spec, model, (id) => deadLine.get(id) ?? 0)
  const Wtot = [...W.values()].reduce((a, b) => a + b, 0)
  const hn = eaveHeight + rise / 2 // 기면~평균 지붕면
  const sInput = spec.seismic
  const CNLD: Record<string, { ITEMS: unknown[] }> = {}
  const seismic = {} as LoadInfo['seismic']
  seismic.W = Wtot
  for (const dir of ['X', 'Y'] as const) {
    const T = lat.period(dir === 'X' ? 'moment' : 'braced', hn)
    const cf = lat.seismicCoef({ SDS: sInput.SDS, SD1: sInput.SD1, I: sInput.I, R: dir === 'X' ? sInput.Rx : sInput.Ry, T })
    const V = cf.c * Wtot
    const Ft = T > 0.7 ? Math.min(0.07 * T * V, 0.25 * V) : 0
    let denom = 0
    for (const n of model.nodes) denom += (W.get(n.id) ?? 0) * n.z
    const zTop = Math.max(...model.nodes.map((n) => n.z))
    const topW = model.nodes.filter((n) => n.z === zTop).reduce((a, n) => a + (W.get(n.id) ?? 0), 0)
    for (const n of model.nodes) {
      const w = W.get(n.id) ?? 0
      let F = denom > 0 ? ((V - Ft) * w * n.z) / denom : 0
      if (Ft > 0 && n.z === zTop && topW > 0) F += (Ft * w) / topW
      if (F === 0) continue
      const items = (CNLD[n.id] ??= { ITEMS: [] }).ITEMS
      items.push({ ID: items.length + 1, LCNAME: `E${dir}`, GROUP_NAME: '', FX: dir === 'X' ? F : 0, FY: dir === 'Y' ? F : 0, FZ: 0, MX: 0, MY: 0, MZ: 0 })
    }
    seismic[dir] = { T, c: cf.c, gov: cf.gov, V }
  }

  /* ── 풍 (횡방향: +X, 용마루에 수직). 封閉/部分封閉 건물 MWFRS p = q·G·Cp − q_i·(GCpi), 風力規範 2.2 ── */
  const wi = spec.wind
  const hRef = theta < (10 * Math.PI) / 180 ? eaveHeight : eaveHeight + rise / 2 // 風力規範 符號 h
  const qOf = (z: number) => lat.windQ(z, { V10: wi.V10, I: wi.I, exposure: wi.exposure })
  const qh = qOf(hRef)
  const G = lat.gust
  const gpi = lat.gcpi(wi.enclosure)
  const cpWl = lat.wallCp.windward
  const cpWd = lat.wallCp.leeward(span / length) // L(평행)/B(수직) = 스팬/길이... 풍향 X: L = 스팬, B = 길이
  const rc = lat.roofCp({ thetaDeg: (theta * 180) / Math.PI, hOverL: hRef / span })
  const windVariants = [
    { name: 'WX1', roofCp: rc.high, s: 1 }, { name: 'WX2', roofCp: rc.high, s: -1 },
    { name: 'WX3', roofCp: rc.low, s: 1 }, { name: 'WX4', roofCp: rc.low, s: -1 },
  ]
  const windCases: LoadInfo['wind']['cases'] = []
  for (const v of windVariants) {
    const pi = qh * v.s * gpi // q_i·(GCpi)
    const pWallW = (z: number) => qOf(z) * G * cpWl - pi
    const pWallL = qh * G * cpWd - pi
    const pRoofW = qh * G * v.roofCp - pi
    const pRoofL = qh * G * rc.leeward - pi
    for (const e of model.elements) {
      if (e.role !== 'purlin' && e.role !== 'strut' && e.role !== 'girt') continue
      const n1 = nodeById.get(e.n1)!
      const x = n1.x
      if (e.role === 'girt') {
        // 풍상 벽(x=0): +X 로 밀림, 풍하 벽(x=span): 흡입 → 바깥(+X)
        addLine(e.id, v.name, 'GX', x === 0 ? pWallW(n1.z) * gWall : -pWallL * gWall)
        continue
      }
      let fx = 0, fz = 0
      const roofW = (s: number) => { fx += pRoofW * s * sinT; fz += -pRoofW * s * cosT }
      const roofL = (s: number) => { fx += -pRoofL * s * sinT; fz += -pRoofL * s * cosT }
      if (x === 0) { roofW(sRoof / 2); fx += pWallW(eaveHeight) * (gWall / 2) }
      else if (x === span) { roofL(sRoof / 2); fx += -pWallL * (gWall / 2) }
      else if (Math.abs(x - span / 2) < 1e-9) { roofW(sRoof / 2); roofL(sRoof / 2) }
      else if (x < span / 2) roofW(sRoof)
      else roofL(sRoof)
      addLine(e.id, v.name, 'GX', fx)
      addLine(e.id, v.name, 'GZ', fz)
    }
    windCases.push({ name: v.name, roofCp: v.roofCp, gcpi: v.s * gpi })
  }

  /* ── 하중조합: 종류별 변형 전개 (E 는 ±, W 는 케이스 자체가 방향·내압 변형) ── */
  const variants: Record<LoadCaseType, Variant[]> = {
    D: [{ name: 'D', sign: 1, tag: '' }],
    L: [{ name: 'LR', sign: 1, tag: '' }],
    W: windVariants.map((v) => ({ name: v.name, sign: 1 as const, tag: ` ${v.name}` })),
    E: (['EX', 'EY'] as const).flatMap((n) => [
      { name: n, sign: 1 as const, tag: ` +${n}` },
      { name: n, sign: -1 as const, tag: ` -${n}` },
    ]),
  }
  const LCOM: Record<string, unknown> = {}
  let no = 0
  for (const c of prof.combos({ heavyLive: false })) {
    const kinds = c.terms.map(([k]) => k)
    const wOrE = kinds.find((k) => k === 'W' || k === 'E')
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
    ...windVariants.map((v): [string, string, string] => [v.name, 'W', 'Wind X']),
  ]
  cases.forEach(([name, type, desc], i) => { STLD[i + 1] = { NAME: name, TYPE: type, DESC: desc } })

  return {
    STLD,
    BODF: { 1: { LCNAME: 'D', GROUP_NAME: '', FV: [0, 0, -1] } },
    BMLD,
    CNLD,
    'LCOM-GEN': LCOM,
    info: { roofLive: qLive, seismic, wind: { qh, hRef, cases: windCases, windwardRoofCp: { low: rc.low, high: rc.high } } },
  }
}
