/* 한국 KDS 부재·사용성 검토 — 결과 형식은 TW·CN 과 공유, 강도식·길이·한계는 여기와 codes/krSteel.ts.
   KDS 14 31 15 4.3 유효길이법: 가상하중(중력 조합, krLoads) + 횡이동 K(4.3-2) + B1·B2(4.5) — M_u = B·M (B = max(B1, B2), 비횡이동/횡이동 분리 없이 보수적).
   길이 가정 (TW 와 같은 골조 구성): 기둥 면내 K·처마높이 / 면외·L_b = 거트 간격, 지붕보 면내 경사길이 / 면외·L_b = 퍼린 간격,
   퍼린·거트 강축 = 베이, 약축·L_b = 베이/(새그로드+1) (약축 모멘트 ×1/(n+1)²), 스트럿 = 베이, 풍주 강축 = 높이·약축 = 거트 간격, 가새 KL = 대각선/2.
   사용성 — KDS 에 수치 한계 없음(14 31 55 4.1.3·4.1.4): 프로젝트 기준으로 표시. 지진 층간변위만 KDS 41 17 00 7.2.8·표 8.2-1 규정값. */
import { cbKR, krB1, krB2, krCapacity, krCheck, krKSway, SLENDER_KR, type KrCapacity } from '../codes/krSteel'
import { fyKR } from '../codes/kr'
import type { Results } from '../actions/results'
import type { CCSummary, DesignResult, MemberCheck, ServiceCheck } from './design'
import type { LoadInfo } from './loads'
import { portalGeometry } from './portal'
import { sectionProps } from './sections'
import { validateDesignResults } from './resultValidation'
import { krCCLoads } from './krSecondary'
import { frameSpans, type ElementRole, type FactoryModel, type FactorySpec } from './types'

/** 프로젝트 기준 처짐 한계 (스팬/값) — 지붕보·퍼린, 지붕활하중 또는 적설 */
export const KR_DEFL = { rafter: 240, purlin: 240 }
/** 풍 횡변위 프로젝트 기준 H/150 — 재현기간 50년 풍하중 = 0.65W (KDS 41 12 00 5.1.3(2)) */
export const KR_WIND_DRIFT = { factor: 0.65, limit: 1 / 150 }

/** 조합 이름의 주 횡력 방향 — 첫 'WX…'·'±EX'·'+NX' (지진 직교 0.3 성분은 뒤에 옴) */
const comboDir = (c: string): 'X' | 'Y' | null => (c.match(/(?:W|E|N)([XY])/)?.[1] as 'X' | 'Y' | undefined) ?? null

export function runKrDesign(spec: FactorySpec, model: FactoryModel, info: LoadInfo, res: Results, roles?: readonly ElementRole[]): DesignResult {
  validateDesignResults(spec, model, info, res, roles)
  const G = portalGeometry(spec), nodes = new Map(model.nodes.map((n) => [n.id, n]))
  const col = sectionProps(spec.sections.column), raf = sectionProps(spec.sections.rafter)
  /* 14 31 15 4.3.4(5)① 기초 G — 핀 10, 고정 1. 기둥 상단 G = (Ic/Lc)/(Ir/Lr) */
  const Kat = new Map(G.eaveXs.map((x) => [x, krKSway((col.Ix / G.zAt(x)) / (raf.Ix / G.rafterLen), spec.baseFixity === 'fixed' ? 1 : 10)]))
  const Lsec = spec.baySpacing / (spec.sagRods + 1)
  const mm = (m: number) => m * 1000
  const members: MemberCheck[] = [], service: ServiceCheck[] = []
  /* 퍼린·거트 외장재설계용 풍하중 (KDS 41 12 00 5.4·5.8) — krSecondary */
  const cc = krCCLoads(spec, model, info)
  let b2Max = 1
  for (const e of model.elements) {
    if (roles && !roles.includes(e.role)) continue
    const a = nodes.get(e.n1)!, b = nodes.get(e.n2)!, sp = sectionProps(e.section)
    const Lel = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)
    const lens = e.role === 'column' ? { KLx: mm((e.lean ? 1 : Kat.get(a.x)!) * G.zAt(a.x)), KLy: mm(Lel), Lb: mm(Lel) }
      : e.role === 'rafter' ? { KLx: mm(G.slopeLen), KLy: mm(Lel), Lb: mm(Lel) }
      : e.role === 'purlin' || e.role === 'girt' ? { KLx: mm(Lel), KLy: mm(Math.min(Lel, Lsec)), Lb: mm(Math.min(Lel, Lsec)) }
      : e.role === 'post' ? { KLx: mm(G.zAt(a.x)), KLy: mm(Lel), Lb: mm(Lel) }
      : e.role === 'brace' ? { KLx: mm(Lel / 2), KLy: mm(Lel / 2), Lb: mm(Lel / 2) }
      : { KLx: mm(Lel), KLy: mm(Lel), Lb: mm(Lel) }
    const material = e.role === 'purlin' || e.role === 'girt' ? spec.secondaryMaterial ?? spec.material : spec.material
    const Fy = fyKR(material, Math.max(sp.tf, sp.tw))
    const frame = e.role === 'column' || e.role === 'rafter'
    const myScale = e.role === 'purlin' || e.role === 'girt' ? 1 / (spec.sagRods + 1) ** 2 : 1
    let best: MemberCheck | null = null
    let maxComp = 0
    const consider = (combo: string, part: number, f: MemberCheck['forces'], cap: KrCapacity, B: number, Cb: number) => {
      const r = krCheck(cap, f, B)
      if (best && r.ratio <= best.ratio) return
      best = {
        id: e.id, role: e.role, section: e.section, ratio: r.ratio, combo, part, eq: r.eq, forces: f,
        cap: { phiPnc: cap.phiPnc, phiPnt: cap.phiPnt, phiMnx: cap.phiMnx, phiMny: cap.phiMny, phiVn: cap.phiVn, mxMode: cap.mxMode, compact: cap.compact, KLr: cap.KLr, lambdaC: cap.lambdaC },
        B, Cb, lengths: lens, slender: { value: 0, limit: 0 }, notes: cap.notes,
      }
    }
    if (e.role === 'brace') {
      const cap = krCapacity(sp, Fy, lens, 1)
      for (const [combo, P] of res.truss.get(e.id) ?? []) { if (P < 0) maxComp = Math.max(maxComp, -P); consider(combo, -1, { P, Mx: 0, My: 0, V: 0 }, cap, 1, 1) }
    } else {
      for (const [combo, pts] of res.beam.get(e.id) ?? []) {
        const Cb = cbKR(pts.map((p) => p.My))
        const Pc = Math.max(0, ...pts.map((p) => -p.P))
        maxComp = Math.max(maxComp, Pc)
        const cap = krCapacity(sp, Fy, lens, Cb)
        let B = krB1(Pc, sp.Ix, Math.min(lens.KLx, mm(Lel)))
        if (frame) {
          const sw = res.sway.get(combo), d = comboDir(combo)
          /* R_M — 모멘트골조 방향(X) 0.85 (P_mf = P_story 로 보수적), 가새골조 방향(Y) 1.0 */
          const b2 = (dir: 'X' | 'Y') => (sw ? krB2(sw[dir].sumPu, sw[dir].drift, sw[dir].sumH, spec.eaveHeight, dir === 'X' ? 0.85 : 1) : 1)
          const B2 = d ? b2(d) : Math.max(b2('X'), b2('Y'))
          b2Max = Math.max(b2Max, B2)
          B = Math.max(B, B2)
        }
        pts.forEach((p, i) => consider(combo, i, { P: p.P, Mx: Math.abs(p.My), My: Math.abs(p.Mz) * myScale, V: Math.abs(p.Vz) }, cap, B, Cb))
      }
      /* 외장재 풍압: 정압 = 외장재 쪽 플랜지 압축(구속, L_b ≈ 0), 부압 = 자유 플랜지 압축(L_b = 새그로드 간격, C_b 1.0) */
      const ccl = cc.get(e.id)
      if (ccl) {
        const capBraced = krCapacity(sp, Fy, { ...lens, Lb: 1 }, 1), capFree = krCapacity(sp, Fy, lens, 1)
        for (const d of ccl.demands) consider(d.combo, 2, d.f, d.braced ? capBraced : capFree, 1, 1)
      }
    }
    if (!best) throw new Error(`KDS: missing analysis forces for element ${e.id}`)
    const m = best as MemberCheck
    /* 4.1.1·4.2.2 세장비 (가급적) — 압축 KL/r 200, 인장 L/r 300 */
    m.slender = maxComp > 1e-3
      ? { value: Math.max(lens.KLx / sp.rx, lens.KLy / sp.ry), limit: SLENDER_KR.compression }
      : { value: Math.max(lens.KLx, lens.KLy) / Math.min(sp.rx, sp.ry), limit: SLENDER_KR.tension }
    if (m.slender.value / m.slender.limit > m.ratio) { m.ratio = m.slender.value / m.slender.limit; m.eq = 'KL/r' }
    /* 웨브 세장(미구현) H 는 NG 로 */
    if (m.notes.some((n) => n.startsWith('web slender'))) m.ratio = Math.max(m.ratio, 9.99)
    members.push(m)
  }
  /* 14 31 15 4.3.1 유효길이법 적용 조건 B2 ≤ 1.5 — 넘으면 골조 부재에 표시 (직접해석법 필요) */
  if (b2Max > 1.5) for (const m of members) if (m.role === 'column' || m.role === 'rafter') m.notes = [...m.notes, `B2 ${b2Max.toFixed(2)} > 1.5 (KDS 14 31 15 4.3.1)`]

  if (!roles) {
    const eaves = model.nodes.filter(G.isEaveNode), ridges = model.nodes.filter(G.isDeflNode)
    const disp = (lc: string, id: number) => {
      const v = res.disp.get(lc)?.get(id)
      if (!v || ![v.dx, v.dy, v.dz].every(Number.isFinite)) throw new Error(`KDS: missing/invalid service displacement ${lc}, node ${id}`)
      return v
    }
    const push = (key: ServiceCheck['key'], value: number, limit: number, lc: string, clause: string) => service.push({ key, value, limit, ratio: value / limit, case: lc, clause })
    const kr = info.kr!
    for (const [d, comp, wk, ek] of [['X', 'dx', 'windDriftX', 'seisDriftX'], ['Y', 'dy', 'windDriftY', 'seisDriftY']] as const) {
      let max = 0, at = ''
      for (const w of info.wind.variants) for (const n of eaves) {
        const v = Math.abs(w.parts.reduce((s, p) => s + p.f * disp(p.lc, n.id)[comp], 0))
        if (v > max) { max = v; at = w.tag }
      }
      push(wk, KR_WIND_DRIFT.factor * max / spec.eaveHeight, KR_WIND_DRIFT.limit, `0.65 × ${at}`, 'Project criterion H/150 at 50-yr wind 0.65W (KDS 41 12 00 5.1.3(2))')
      /* 7.2.8 δ = Cd·δ_xe/I_E (우발비틀림 ± 포함), P-Δ: θ = P·Δ/(V·h·Cd) > 0.1 이면 a_d = 1/(1 − θ) */
      let dxe = 0
      for (const n of eaves) for (const sg of [1, -1]) dxe = Math.max(dxe, Math.abs(disp(`E${d}`, n.id)[comp] + sg * disp(`ET${d}`, n.id)[comp]))
      const s = info.seismic[d]
      const delta = kr.Cd * dxe / kr.IE
      const thetaPD = s.V > 0 ? info.seismic.W * delta / (s.V * spec.eaveHeight * kr.Cd) : 0
      const ad = thetaPD > 0.1 ? 1 / (1 - thetaPD) : 1
      push(ek, ad * delta / spec.eaveHeight, kr.driftLimit, `Cd·(E${d}±ET${d})/I_E${ad > 1 ? ` × ${ad.toFixed(3)}` : ''}`, `KDS 41 17 00 7.2.8 · table 8.2-1 (${kr.driftLimit}h, θ = ${thetaPD.toFixed(3)})`)
    }
    /* 지붕보 처짐 — 마루(또는 경간 중앙) − 같은 y 처마 평균, 지붕활하중·적설 케이스 중 최대 */
    const wSpan = spec.frame === 'mono' ? spec.span : Math.max(...frameSpans(spec))
    let maxDefl = 0, at = ''
    for (const lc of [...res.disp.keys()].filter((x) => x === 'LR' || /^SN/.test(x))) for (const r of ridges) {
      const peers = eaves.filter((n) => Math.abs(n.y - r.y) < 1e-8)
      const v = Math.abs(disp(lc, r.id).dz - peers.reduce((t, n) => t + disp(lc, n.id).dz, 0) / Math.max(1, peers.length))
      if (v > maxDefl) { maxDefl = v; at = lc }
    }
    push('rafterDefl', maxDefl, wSpan / KR_DEFL.rafter, at, `Project criterion L/${KR_DEFL.rafter} (KDS 14 31 55 4.1.3)`)
    const dp = krPurlinDefl(spec, info, spec.sections.purlin)
    push('purlinDefl', dp, spec.baySpacing / KR_DEFL.purlin, 'max(LR, SN)', `Project criterion L/${KR_DEFL.purlin} (KDS 14 31 55 4.1.3)`)
  }
  const byRole: DesignResult['byRole'] = {}
  for (const m of members) if (!byRole[m.role] || m.ratio > byRole[m.role]!.ratio) byRole[m.role] = m
  const sums = new Map<string, CCSummary>()
  if (!roles) for (const [id, c] of cc) {
    const role = model.elements[id - 1].role, key = `${role}-${c.zone}`, old = sums.get(key)
    if (old) { old.count++; old.A = Math.min(old.A, c.A); old.pPos = Math.max(old.pPos, c.pPos); old.pNeg = Math.min(old.pNeg, c.pNeg) }
    else sums.set(key, { role, zone: c.zone, A: c.A, pPos: c.pPos, pNeg: c.pNeg, count: 1 })
  }
  return { members, byRole, service, maxRatio: Math.max(0, ...members.map((m) => m.ratio)), ng: members.filter((m) => m.ratio > 1).length + service.filter((s) => s.ratio > 1).length, cc: [...sums.values()] }
}

/** 퍼린 처짐 (m) — 단순보 5wL⁴/384EI, w = max(지붕활하중, 적설) × 퍼린 간격 × cosθ */
export function krPurlinDefl(spec: FactorySpec, info: LoadInfo, section: string): number {
  const G = portalGeometry(spec)
  const w = Math.max(info.roofLive, info.snow ?? 0) * G.sRoof * Math.cos(G.theta)
  return 5 * w * spec.baySpacing ** 4 / (384 * 210000e3 * sectionProps(section).Ix * 1e-12)
}
