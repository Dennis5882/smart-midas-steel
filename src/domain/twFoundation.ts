/* 대만 독립기초 예비검토 (순수) — 建築物基礎構造設計規範 (KB foundation-design-code).
   하중: 2.11 工作載重 — 長期 D+L, 短期 = 長期 ± 풍(耐風 2.12 변형 그대로)·지진(설계 지진력 E + 우발 비틀림, ±) 및 L 없는 최소 하중.
   지반 반력: 4.1.1 P = P′ + W_S + W_F, 剛性 기초 · 4.3.2 解說 Meyerhof 有效面積 B′ = B − 2e_B, L′ = L − 2e_L → q = N / (B′L′).
   허용 지지력: 4.3.5 표4.3-1 — 장기 FS 3 (입력 qa 가 장기 허용값), 단기 1.5 qa.
   편심 한계: 4.3.2 — 장기 e ≤ B/6, 단기 e ≤ B/3 (방향별).
   수평: 4.6.1 표4.6-1 FS 장기 1.5·단기 1.2, 4.6.2 R_f = N tanδ (부착력 c_a·前側 수동저항 4.6.3 은 보수적으로 무시).
   범위 밖(전문가 검토): 地下水 浮力(2.6)·침하(4.4)·기초판 RC 설계(휨·뚫림전단)·앵커 콘크리트 정착·지중보·액상화. */
import type { FactoryModel, FactorySpec } from './types'
import { isBaseNode } from './types'

export interface FootingInput {
  /** 장기 허용 지지력 qa (kN/m², 지반조사 보고서) */
  qa: number
  /** 기초 저면 깊이 Df (m, 지표 = 기둥 주각 높이) */
  depth: number
  /** 기초판 두께 (m) */
  thickness: number
  /** 기초판 아래 마찰계수 tanδ (δ = 2/3φ′~φ′, 4.6.2) */
  friction: number
  soilGamma: number
  concreteGamma: number
  source: string
  confirmed: boolean
}
export const defaultFootingInput = (): FootingInput => ({ qa: 150, depth: 1.5, thickness: 0.6, friction: 0.4, soilGamma: 18, concreteGamma: 24, source: '', confirmed: false })
export function footingInputError(f: FootingInput): keyof FootingInput | undefined {
  if (!(f.qa > 0)) return 'qa'
  if (!(f.thickness > 0)) return 'thickness'
  if (!(f.depth >= f.thickness)) return 'depth'
  if (!(f.friction > 0 && f.friction <= 1)) return 'friction'
  if (!(f.soilGamma > 0)) return 'soilGamma'
  if (!(f.concreteGamma > 0)) return 'concreteGamma'
  return undefined
}

/** 절점 → 하중 케이스 → 반력 [FX, FY, FZ, MX, MY, MZ] (kN, kN·m — 지반이 구조물에 주는 힘) */
export type BaseReactions = Map<number, Map<string, number[]>>
export type FootingGroup = 'column' | 'lean' | 'post'
export interface ServiceCombo { name: string; term: 'long' | 'short'; parts: { lc: string; f: number }[] }
export interface FootingRow {
  group: FootingGroup; nodes: number; node: number
  B: number; L: number
  /** 지배 비율 (≤ 1 OK) — 지지력·편심·활동 */
  ratios: { bearing: number; eccentricity: number; sliding: number }
  governing: { bearing: string; eccentricity: string; sliding: string }
  N: number; q: number; qAllow: number
  ok: boolean
}
export interface FootingResult { rows: FootingRow[]; combos: number; maxSize: number; ok: boolean }

const MAX = 6
/** 후보 B × L (0.1 m, B = 골조 방향 ≥ L, B/L ≤ 1.5) — 면적 오름차순, 같으면 정사각에 가까운 것 */
const CANDIDATES: [number, number][] = (() => {
  const out: [number, number][] = []
  for (let l = 10; l <= MAX * 10; l++) for (let b = l; b <= Math.min(MAX * 10, Math.floor(l * 1.5)); b++) out.push([b / 10, l / 10])
  return out.sort((x, y) => Math.round(x[0] * x[1] * 100) - Math.round(y[0] * y[1] * 100) || (x[0] - x[1]) - (y[0] - y[1]))
})()

/** 2.11 공작하중 조합 — 풍 변형은 하중 정보(info.wind.variants), 지진은 EX/EY + 우발 비틀림 ± */
export function serviceCombos(cases: string[], windVariants: { tag: string; parts: { lc: string; f: number }[] }[]): ServiceCombo[] {
  const has = new Set(cases)
  const D = [{ lc: 'D', f: 1 }], L = has.has('LR') ? [{ lc: 'LR', f: 1 }] : []
  const out: ServiceCombo[] = [{ name: 'D+L', term: 'long', parts: [...D, ...L] }]
  const lateral: { tag: string; parts: { lc: string; f: number }[] }[] = [...windVariants.filter((v) => v.parts.every((p) => has.has(p.lc)))]
  for (const d of ['X', 'Y'] as const) {
    if (!has.has(`E${d}`)) continue
    const t = has.has(`ET${d}`) ? `ET${d}` : ''
    for (const s of [1, -1]) for (const ts of t ? [1, -1] : [0]) lateral.push({ tag: `${s > 0 ? '+' : '-'}E${d}${t ? (ts > 0 ? '+T' : '-T') : ''}`, parts: [{ lc: `E${d}`, f: s }, ...(t ? [{ lc: t, f: ts }] : [])] })
  }
  for (const v of lateral) {
    out.push({ name: `D+L+${v.tag}`, term: 'short', parts: [...D, ...L, ...v.parts] })
    out.push({ name: `D+${v.tag}`, term: 'short', parts: [...D, ...v.parts] })
  }
  return out
}

/** 주각 절점 분류 — 바깥 기둥 열 / 내부 흔들림 기둥 / 박공 풍주 */
export function footingGroups(model: FactoryModel): Map<number, FootingGroup> {
  const out = new Map<number, FootingGroup>()
  const base = new Set(model.nodes.filter((n) => isBaseNode(model, n)).map((n) => n.id))
  for (const e of model.elements) {
    if (!base.has(e.n1) || out.has(e.n1)) continue
    if (e.role === 'post') out.set(e.n1, 'post')
    else if (e.role === 'column') out.set(e.n1, e.lean || e.interior ? 'lean' : 'column')
  }
  return out
}

interface Load { name: string; term: 'long' | 'short'; F: number[] }
/** 한 기초 크기의 검토 — 비율 최대값과 지배 조합 */
function checkSize(B: number, L: number, loads: Load[], f: FootingInput) {
  const area = B * L, W = area * (f.thickness * f.concreteGamma + Math.max(0, f.depth - f.thickness) * f.soilGamma)
  const r = { bearing: 0, eccentricity: 0, sliding: 0 }, g = { bearing: '', eccentricity: '', sliding: '' }
  let gov = { N: 0, q: 0, qAllow: 0 }
  for (const { name, term, F } of loads) {
    const [fx, fy, fz, mx, my] = F
    /* 기초 저면 중심에 대한 모멘트: 주각 힘(−R)이 Df 위에 작용 */
    const N = fz + W, MbX = f.depth * fy - mx, MbY = -f.depth * fx - my
    const lim = term === 'long' ? 1 / 6 : 1 / 3, qAllow = f.qa * (term === 'long' ? 1 : 1.5), fs = term === 'long' ? 1.5 : 1.2
    if (!(N > 0)) { r.bearing = r.eccentricity = Infinity; g.bearing = g.eccentricity = name; continue }
    const eB = Math.abs(MbY) / N, eL = Math.abs(MbX) / N
    const ecc = Math.max(eB / (lim * B), eL / (lim * L))
    const Be = B - 2 * eB, Le = L - 2 * eL
    const q = Be > 0 && Le > 0 ? N / (Be * Le) : Infinity
    const sl = Math.hypot(fx, fy) * fs / (f.friction * N)
    if (ecc > r.eccentricity) { r.eccentricity = ecc; g.eccentricity = name }
    if (q / qAllow > r.bearing) { r.bearing = q / qAllow; g.bearing = name; gov = { N, q, qAllow } }
    if (sl > r.sliding) { r.sliding = sl; g.sliding = name }
  }
  return { r, g, gov }
}

/** 주각마다 통과하는 최소 면적 B×L 을 고르고 그룹별 최대를 보고 (6 m 에서도 NG 면 기초 형식 재검토) */
export function twFootings(spec: FactorySpec, model: FactoryModel, cases: string[], windVariants: { tag: string; parts: { lc: string; f: number }[] }[], reactions: BaseReactions, f: FootingInput): FootingResult | null {
  if (spec.code !== 'TW' || footingInputError(f) || !reactions.size) return null
  const combos = serviceCombos(cases, windVariants), groups = footingGroups(model)
  const best = new Map<FootingGroup, FootingRow & { count: number }>()
  for (const [node, group] of groups) {
    const R = reactions.get(node)
    if (!R) return null
    const loads: Load[] = []
    for (const c of combos) {
      const F = [0, 0, 0, 0, 0, 0]
      for (const p of c.parts) { const v = R.get(p.lc); if (!v) return null; for (let i = 0; i < 6; i++) F[i] += p.f * v[i] }
      loads.push({ name: c.name, term: c.term, F })
    }
    let pick: FootingRow | null = null
    for (const [B, L] of CANDIDATES) {
      const { r, g, gov } = checkSize(B, L, loads, f)
      if (r.bearing <= 1 && r.eccentricity <= 1 && r.sliding <= 1) { pick = { group, nodes: 0, node, B, L, ratios: r, governing: g, ...gov, ok: true }; break }
    }
    if (!pick) { const { r, g, gov } = checkSize(MAX, MAX, loads, f); pick = { group, nodes: 0, node, B: MAX, L: MAX, ratios: r, governing: g, ...gov, ok: false } }
    const prev = best.get(group)
    const worse = !prev || (!pick.ok && prev.ok) || (pick.ok === prev.ok && pick.B * pick.L > prev.B * prev.L) || (pick.ok === prev.ok && pick.B * pick.L === prev.B * prev.L && Math.max(...Object.values(pick.ratios)) > Math.max(...Object.values(prev.ratios)))
    best.set(group, { ...(worse ? pick : prev!), count: (prev?.count ?? 0) + 1 })
  }
  const order: FootingGroup[] = ['column', 'lean', 'post']
  const rows = order.filter((k) => best.has(k)).map((k) => { const { count, ...row } = best.get(k)!; return { ...row, nodes: count } })
  return { rows, combos: combos.length, maxSize: MAX, ok: rows.every((r) => r.ok) }
}
