/* 부재 설계 검토 (M3) — 해석 결과 + 기준 프로필 강도식 → 부재별 강도비, 사용성.
   길이 가정 (보고서에 그대로 표기):
   - 기둥: 면내 K = 횡이동 골조 정렬도(4.8) · L = 처마높이, 면외 K = 1 · L = 거트 간격(거트 + 플라이브레이스가 양 플랜지 지지), Lb = 거트 간격
   - 지붕보: 면내 K = 1 · L = 처마~마루 경사길이, 면외 L = 퍼린 간격(퍼린 + 플라이브레이스), Lb = 퍼린 간격
   - 퍼린·거트: 강축 L = 베이, 약축·Lb = 베이 / (새그로드 + 1), 약축 모멘트 × 1/(새그로드+1)² (해석 모델에 새그로드 없음)
   - 스트럿: L = Lb = 베이 / 풍주: 강축 L = 풍주 높이, 약축·Lb = 거트 간격
   - 가새: X 교차점에서 서로 지지 → KL = 대각선 길이 / 2 (해석 모델은 교차점 미연결)
   2차 효과: 골조 부재(기둥·지붕보) B = max(B1, B2), B2 = (8.2-5) 조합 방향(X: 횡풍·X 지진, Y: 종풍·Y 지진, 중력: 큰 쪽);
   그 외 B = B1 (Cm = 1.0, 보수적). */
import { profileOf } from '../codes'
import { b1Of, b2Of, capacity, cbOf, check, kSway, SLENDER_LIMIT, type Capacity, type CheckResult } from '../codes/twSteel'
import type { Results } from '../actions/results'
import type { LoadInfo } from './loads'
import { portalGeometry } from './portal'
import { sectionProps } from './sections'
import type { ElementRole, FactoryModel, FactorySpec } from './types'

export interface MemberCheck {
  id: number
  role: ElementRole
  section: string
  ratio: number
  combo: string
  /** 지배 지점 0..4 (I, 1/4, 2/4, 3/4, J), 가새는 -1 */
  part: number
  eq: CheckResult['eq'] | 'KL/r'
  forces: { P: number; Mx: number; My: number; V: number }
  cap: Pick<Capacity, 'phiPnc' | 'phiPnt' | 'phiMnx' | 'phiMny' | 'phiVn' | 'mxMode' | 'compact' | 'KLr' | 'lambdaC'>
  B: number
  Cb: number
  lengths: { KLx: number; KLy: number; Lb: number }
  slender: { value: number; limit: number }
  notes: string[]
}

export interface ServiceCheck {
  key: 'windDriftX' | 'windDriftY' | 'seisDriftX' | 'seisDriftY' | 'rafterDefl' | 'purlinDefl'
  value: number
  limit: number
  ratio: number
  case: string
  clause: string
}

export interface DesignResult {
  members: MemberCheck[]
  service: ServiceCheck[]
  /** 역할별 최대 강도비 부재 */
  byRole: Partial<Record<ElementRole, MemberCheck>>
  maxRatio: number
  ng: number
}

const dist = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) => Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)

/** 조합 이름에서 횡력 방향 — 'WX…', '±EX' → X / 'WY…', '±EY' → Y / 중력 → null */
const comboDir = (c: string): 'X' | 'Y' | null => (/(W|E)X/.test(c) ? 'X' : /(W|E)Y/.test(c) ? 'Y' : null)

export function runDesign(spec: FactorySpec, model: FactoryModel, info: LoadInfo, res: Results): DesignResult {
  const prof = profileOf(spec.code)
  const mat = prof.materials[spec.material]
  const G = portalGeometry(spec)
  const nodes = new Map(model.nodes.map((n) => [n.id, n]))
  const mm = (m: number) => m * 1000

  /* 기둥 면내 K — G_top = (Ic/Lc) / (Ir/Lr), 지붕보 길이 = 처마~처마 경사길이(대칭 횡이동 = 역대칭 곡률), G_bottom = 핀 10 / 고정 1 */
  const col = sectionProps(spec.sections.column), raf = sectionProps(spec.sections.rafter)
  const Gtop = (col.Ix / spec.eaveHeight) / (raf.Ix / (2 * G.slopeLen))
  const Kcol = kSway(Gtop, spec.baseFixity === 'fixed' ? 1 : 10)
  const Lsec = (spec.baySpacing / (spec.sagRods + 1))

  const lengthsOf = (role: ElementRole, Lel: number, e: { n1: number; n2: number }) => {
    switch (role) {
      case 'column': return { KLx: mm(Kcol * spec.eaveHeight), KLy: mm(Lel), Lb: mm(Lel) }
      case 'rafter': return { KLx: mm(G.slopeLen), KLy: mm(Lel), Lb: mm(Lel) }
      case 'purlin': case 'girt': return { KLx: mm(Lel), KLy: mm(Math.min(Lel, Lsec)), Lb: mm(Math.min(Lel, Lsec)) }
      case 'post': return { KLx: mm(G.zAt(nodes.get(e.n1)!.x)), KLy: mm(Lel), Lb: mm(Lel) }
      case 'brace': return { KLx: mm(Lel / 2), KLy: mm(Lel / 2), Lb: mm(Lel / 2) }
      default: return { KLx: mm(Lel), KLy: mm(Lel), Lb: mm(Lel) }
    }
  }

  const members: MemberCheck[] = []
  for (const e of model.elements) {
    const sp = sectionProps(e.section)
    const Lel = dist(nodes.get(e.n1)!, nodes.get(e.n2)!)
    const { KLx, KLy, Lb } = lengthsOf(e.role, Lel, e)
    const frame = e.role === 'column' || e.role === 'rafter'
    let best: MemberCheck | null = null
    let maxComp = 0

    const consider = (combo: string, part: number, f: MemberCheck['forces'], cap: Capacity, B: number, Cb: number) => {
      const r = check(cap, f, B)
      if (!best || r.ratio > best.ratio) {
        best = {
          id: e.id, role: e.role, section: e.section, ratio: r.ratio, combo, part, eq: r.eq, forces: f,
          cap: { phiPnc: cap.phiPnc, phiPnt: cap.phiPnt, phiMnx: cap.phiMnx, phiMny: cap.phiMny, phiVn: cap.phiVn, mxMode: cap.mxMode, compact: cap.compact, KLr: cap.KLr, lambdaC: cap.lambdaC },
          B, Cb, lengths: { KLx, KLy, Lb }, slender: { value: 0, limit: 0 }, notes: cap.notes,
        }
      }
    }

    if (e.role === 'brace') {
      for (const [combo, P] of res.truss.get(e.id) ?? []) {
        if (P < 0) maxComp = Math.max(maxComp, -P)
        const cap = capacity(sp, mat.fy, mat.E, { KLx, KLy, Lb }, 1, Math.max(0, -P))
        consider(combo, -1, { P, Mx: 0, My: 0, V: 0 }, cap, 1, 1)
      }
    } else {
      for (const [combo, pts] of res.beam.get(e.id) ?? []) {
        const Cb = cbOf(pts.map((p) => p.My))
        const Pc = Math.max(0, ...pts.map((p) => -p.P))
        maxComp = Math.max(maxComp, Pc)
        const cap = capacity(sp, mat.fy, mat.E, { KLx, KLy, Lb }, Cb, Pc)
        const B1 = b1Of(Pc, sp, mat.E, KLx > 0 ? Math.min(KLx, mm(Lel)) : mm(Lel))
        let B = B1
        if (frame) {
          const d = comboDir(combo)
          const sw = res.sway.get(combo)
          const b2 = (dir: 'X' | 'Y') => (sw ? b2Of(sw[dir].sumPu, sw[dir].drift, sw[dir].sumH, spec.eaveHeight) : 1)
          B = Math.max(B1, d ? b2(d) : Math.max(b2('X'), b2('Y')))
        }
        /* 퍼린·거트 약축: 해석 모델에 새그로드가 없어 베이 전체 경간으로 계산됨 → 경간 L/(n+1) 기준으로 1/(n+1)² 축소 */
        const myScale = e.role === 'purlin' || e.role === 'girt' ? 1 / (spec.sagRods + 1) ** 2 : 1
        pts.forEach((p, i) => consider(combo, i, { P: p.P, Mx: Math.abs(p.My), My: Math.abs(p.Mz) * myScale, V: Math.abs(p.Vz) }, cap, B, Cb))
      }
    }
    if (!best) continue
    const b = best as MemberCheck
    /* 4.4 세장비 — 압축이 있으면 200, 인장만이면 300 */
    const r = Math.min(sp.rx, sp.ry)
    const slender = maxComp > 1e-3
      ? { value: Math.max(KLx / sp.rx, KLy / sp.ry), limit: SLENDER_LIMIT.compression }
      : { value: Math.max(KLx, KLy) / r, limit: SLENDER_LIMIT.tension }
    b.slender = slender
    if (slender.value / slender.limit > b.ratio) { b.ratio = slender.value / slender.limit; b.eq = 'KL/r' }
    members.push(b)
  }

  /* ── 사용성 ── */
  const service: ServiceCheck[] = []
  const eaveIds = model.nodes.filter((n) => Math.abs(n.z - spec.eaveHeight) < 1e-9 && (n.x === 0 || n.x === spec.span)).map((n) => n.id)
  const ridgeIds = model.nodes.filter((n) => Math.abs(n.x - spec.span / 2) < 1e-9 && Math.abs(n.z - G.ridgeZ) < 1e-9).map((n) => n.id)
  const maxOver = (cases: string[], comp: 'dx' | 'dy', scale = 1) => {
    let v = 0, at = ''
    for (const c of cases) {
      const m = res.disp.get(c)
      if (!m) continue
      for (const id of eaveIds) { const d = Math.abs(m.get(id)?.[comp] ?? 0) * scale; if (d > v) { v = d; at = c } }
    }
    return { v, at }
  }
  /* 風力規範 4.2: 50년 풍 층간변위각 ≤ 5/1000 */
  for (const [key, comp, pre] of [['windDriftX', 'dx', 'WX'], ['windDriftY', 'dy', 'WY']] as const) {
    const { v, at } = maxOver(res.disp.size ? [...res.disp.keys()].filter((c) => c.startsWith(pre)) : [], comp)
    service.push({ key, value: v / spec.eaveHeight, limit: 0.005, ratio: v / spec.eaveHeight / 0.005, case: at, clause: '風力規範 4.2' })
  }
  /* 耐震規範 2.16.1: V* (I = 1) 지진력 아래 층간변위각 ≤ 0.005 — EX/EY 변위 × cStar/c */
  for (const [key, comp, lc, d] of [['seisDriftX', 'dx', 'EX', 'X'], ['seisDriftY', 'dy', 'EY', 'Y']] as const) {
    const s = info.seismic[d]
    const { v } = maxOver([lc], comp, s.cStar / s.c)
    service.push({ key, value: v / spec.eaveHeight, limit: 0.005, ratio: v / spec.eaveHeight / 0.005, case: `${lc} × V*/V`, clause: '耐震規範 2.16.1' })
  }
  /* LRFD 11.5.3: 활하중 처짐 ≤ 스팬/360 — 지붕보: 마루 − 처마 평균 (LR), 퍼린: 단순보 5wL⁴/384EI */
  const lr = res.disp.get('LR')
  if (lr) {
    const ridgeDz = Math.max(...ridgeIds.map((id) => Math.abs(lr.get(id)?.dz ?? 0)))
    const eaveDz = eaveIds.reduce((a, id) => a + Math.abs(lr.get(id)?.dz ?? 0), 0) / Math.max(1, eaveIds.length)
    const d = Math.abs(ridgeDz - eaveDz)
    service.push({ key: 'rafterDefl', value: d, limit: spec.span / 360, ratio: d / (spec.span / 360), case: 'LR', clause: 'LRFD 11.5.3' })
  }
  const pur = sectionProps(spec.sections.purlin)
  const wLR = info.roofLive * G.sRoof * Math.cos(G.theta) // kN/m
  const Lp = spec.baySpacing
  const dPur = (5 * wLR * Lp ** 4) / (384 * mat.E * 1e3 * (pur.Ix * 1e-12)) // m (E kPa, I m⁴)
  service.push({ key: 'purlinDefl', value: dPur, limit: Lp / 360, ratio: dPur / (Lp / 360), case: 'LR', clause: 'LRFD 11.5.3' })

  const byRole: DesignResult['byRole'] = {}
  for (const m of members) if (!byRole[m.role] || m.ratio > byRole[m.role]!.ratio) byRole[m.role] = m
  const maxRatio = Math.max(0, ...members.map((m) => m.ratio))
  const ng = members.filter((m) => m.ratio > 1).length + service.filter((s) => s.ratio > 1).length
  return { members, service, byRole, maxRatio, ng }
}
