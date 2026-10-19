/* 대만 廠房用途 → 바닥 활하중 제안 (메자닌·설비 플랫폼).
   建築技術規則 建築構造編(112年5月10日 修正) 第17條 附表 C類 工業、倉儲類 — KB building-technical-rules-structure/01-基本規則.md:
   C-1 特殊廠庫 500 · C-2 一般廠庫(一般工場、工作場、工廠) 500 · C-2 倉庫(倉儲場)、書庫、貨物輸配所 600 kgf/m².
   지붕은 第26條(不作用途之屋頂)라 용도와 무관 — 여기서는 바닥만.
   耐震規範(113) 2.2 W: 一般倉庫、書庫應計入至少四分之一活載重 → 지진 질량 비율 하한 0.25. */
export type TwUse = 'C1' | 'C2' | 'warehouse'
export const TW_USES: readonly TwUse[] = ['C1', 'C2', 'warehouse']
const KGF: Record<TwUse, number> = { C1: 500, C2: 500, warehouse: 600 }
const ROW: Record<TwUse, string> = { C1: 'C－1 特殊廠庫', C2: 'C－2 一般廠庫（一般工場、工作場、工廠）', warehouse: 'C－2 倉庫（倉儲場）' }

export const isTwUse = (v: unknown): v is TwUse => TW_USES.includes(v as TwUse)
export const twUseKgf = (u: TwUse) => KGF[u]
/** 표값 kN/m² (kgf × 9.80665 / 1000) */
export const twUseLive = (u: TwUse) => KGF[u] * 9.80665 / 1000
/** 지진 유효중량에 넣는 활하중 비율 하한 */
export const twUseMassMin = (u: TwUse) => u === 'warehouse' ? .25 : 0
/** 출처 문구 — 법규 원문 표기 그대로 (화면 언어와 무관) */
export const twUseSource = (u: TwUse) => `建築技術規則 建築構造編 第17條 ${ROW[u]} ${KGF[u]} kgf/m²${u === 'warehouse' ? '；耐震設計規範 2.2 W 計入1/4活載重' : ''}`

/** 표값보다 작게 입력했는지 — 第17條 「不得小於下表所列」 */
export function twUseIssue(p: { use?: TwUse; live: number; liveMassFraction: number }): 'live' | 'mass' | undefined {
  if (!p.use || !isTwUse(p.use)) return undefined
  if (!(p.live >= twUseLive(p.use) - 1e-9)) return 'live'
  if (!(p.liveMassFraction >= twUseMassMin(p.use) - 1e-9)) return 'mass'
  return undefined
}
