/* RC 받침(墩柱) 1단계 (TW, 순수) — 받침 윗면을 강철 골조의 지점으로 본 가정이 맞는지(강성 확인)와 RC 받침·기초 설계용 받침 윗면 반력.
   받침은 기초에 고정된 RC 캔틸레버(높이 h, 사각 b×d, 균열 고려 0.7·Ig, Ec = 4700√fc′ MPa)로 보고,
   강철 기둥 주각 반력(조합별 V·M)이 받침 윗면에 주는 변위·회전이 처마 변위에 더하는 양을 골조 처마 변위와 비교한다.
   RC 벽(牆裙)은 벽 윗면 ≤ 받침 윗면이면 강철 골조의 횡력 저항 요소로 보지 않는다(벽·받침·기초 설계는 범위 밖). */
import type { Results } from '../actions/results'
import type { ServiceCheck } from './design'
import type { LoadInfo } from './loads'
import { isBaseNode, pedestalHeight, steelHeight, type FactoryModel, type FactorySpec } from './types'

/** 받침 변형이 처마 변위에 더하는 비율 한계 — 넘으면 받침을 구조물로 모델링(2단계) 필요 */
export const PEDESTAL_FLEX_LIMIT = 0.1
/** 균열 단면 강성 계수 (기둥, 보수적) */
export const PEDESTAL_CRACKED = 0.7

/** 받침 윗면 힘 한 줄 — 강철 기둥 하단(PartI), 면내 = 골조면(X, 강축 My·Vz), 면외 = Y (Mz·Vy). P + = 인장 */
export interface PedestalForce { combo: string; elem: number; P: number; Mx: number; Vx: number; My: number; Vy: number; Mbase: number }
export interface PedestalSummary {
  h: number; b: number; d: number; fc: number; Ec: number
  /** 지배 조합 — 처마 변위 대비 받침 변형 비율 (방향별) */
  flex: Record<'X' | 'Y', { ratio: number; combo: string; delta: number; frame: number } | null>
  /** 받침 설계용 대표 힘 (최대 압축·최대 인장·최대 면내 모멘트·최대 면내 전단·최대 면외 모멘트) */
  rows: { key: 'Pc' | 'Pt' | 'Mx' | 'Vx' | 'My'; f: PedestalForce }[]
}

/** 캔틸레버 받침 윗면 변위 + 회전 × 강철 높이 = 처마에 더해지는 변위 (m) */
export const pedestalEaveDelta = (V: number, M: number, h: number, EI: number, Hs: number) =>
  (V * h ** 3) / (3 * EI) + (M * h ** 2) / (2 * EI) + ((V * h ** 2) / (2 * EI) + (M * h) / EI) * Hs

export function pedestalCheck(spec: FactorySpec, model: FactoryModel, info: LoadInfo, res: Results): { summary: PedestalSummary; service: ServiceCheck[] } | null {
  const h = pedestalHeight(spec)
  if (!(h > 0) || !spec.pedestal) return null
  const { b, d } = spec.pedestal, fc = spec.fc
  const Ec = 4700 * Math.sqrt(fc) * 1000 // kN/m²
  const bm = b / 1000, dm = d / 1000
  const EI = { X: Ec * PEDESTAL_CRACKED * (dm * bm ** 3) / 12, Y: Ec * PEDESTAL_CRACKED * (bm * dm ** 3) / 12 }
  const Hs = steelHeight(spec)
  const nodes = new Map(model.nodes.map((n) => [n.id, n]))
  const bases = model.elements.filter((e) => e.role === 'column' && isBaseNode(model, nodes.get(e.n1)!))
  const forces: PedestalForce[] = []
  for (const e of bases) for (const [combo, pts] of res.beam.get(e.id) ?? []) {
    if (info.comboKind[combo] === 'asd') continue
    const p = pts[0]
    if (!p) continue
    forces.push({ combo, elem: e.id, P: p.P, Mx: Math.abs(p.My), Vx: Math.abs(p.Vz), My: Math.abs(p.Mz), Vy: Math.abs(p.Vy), Mbase: Math.abs(p.My) + Math.abs(p.Vz) * h })
  }
  /* 강성 확인 — 그 방향 횡하중 조합(풍 W·지진 E, 일반 조합)만: 다른 방향·중력 조합은 그 방향 처마 변위가 거의 없어 비율이 의미 없음
     (라이브 2026-10-21: 방향 구분 없이 보면 X 비율이 Y 풍 조합 WY2-L+T 에서 3.2 로 과대) */
  const dirOf = (combo: string): 'X' | 'Y' | null => /W([XY])\d|E([XY])/.exec(combo)?.slice(1).find(Boolean) as 'X' | 'Y' | undefined ?? null
  const flex: PedestalSummary['flex'] = { X: null, Y: null }
  for (const dir of ['X', 'Y'] as const) {
    const byCombo = new Map<string, number>()
    for (const f of forces) {
      if (info.comboKind[f.combo] !== 'basic' || dirOf(f.combo) !== dir) continue
      const delta = dir === 'X' ? pedestalEaveDelta(f.Vx, f.Mx, h, EI.X, Hs) : pedestalEaveDelta(f.Vy, f.My, h, EI.Y, Hs)
      byCombo.set(f.combo, Math.max(byCombo.get(f.combo) ?? 0, delta))
    }
    for (const [combo, delta] of byCombo) {
      const frame = res.sway.get(combo)?.[dir].drift ?? 0
      if (frame < 1e-4) continue
      const ratio = delta / frame
      if (!flex[dir] || ratio > flex[dir]!.ratio) flex[dir] = { ratio, combo, delta, frame }
    }
  }
  const pick = (score: (f: PedestalForce) => number) => forces.reduce((a, f) => (score(f) > score(a) ? f : a))
  const rows: PedestalSummary['rows'] = forces.length ? [
    { key: 'Pc', f: pick((f) => -f.P) }, { key: 'Pt', f: pick((f) => f.P) },
    { key: 'Mx', f: pick((f) => f.Mbase) }, { key: 'Vx', f: pick((f) => f.Vx) }, { key: 'My', f: pick((f) => f.My + f.Vy * h) },
  ] : []
  const service: ServiceCheck[] = (['X', 'Y'] as const).flatMap((dir) => {
    const v = flex[dir]
    return v ? [{ key: dir === 'X' ? 'pedestalX' as const : 'pedestalY' as const, value: v.ratio, limit: PEDESTAL_FLEX_LIMIT, ratio: v.ratio / PEDESTAL_FLEX_LIMIT, case: v.combo,
      clause: `RC pedestal ${b}×${d} mm, h ${h} m, 0.7·Ig, Ec 4700√fc′; pedestal-induced eave drift / frame eave drift ≤ ${PEDESTAL_FLEX_LIMIT}` }] : []
  })
  return { summary: { h, b, d, fc, Ec, flex, rows }, service }
}
