/* 대만 耐震規範(113) 표1-3 — 공장 형상에 맞는 강구조 횡력저항시스템 (X = 골조 방향 문형 라멘, Y = 길이 방향 가새).
   원문: COde/TW/knowledge/seismic-design-code/01-通則.md 표1-3.
   - X: 三、2.(1) 部分韌性抗彎矩構架(鋼造) R 3.2 · h ≤ 12 m / 三、1.(1) 特殊抗彎矩構架(鋼造) R 4.8 · 不限
   - Y: 二、3.(2) 鋼造同心斜撐配置鋼造邊界構材 R 2.0 · h ≤ 12 m / 二、3.(5) 鋼造特殊同心斜撐配置鋼造邊界構材 R 3.6 · h ≤ 50 m
   특수(SMF·SCBF)는 鋼構造 13장 특수 상세(보-기둥 접합 인정·가새 세장비·접합 강도 등)를 요구 — 앱은 일부만 검토 → scope twSystemSpecial.
   周期식(0.085·0.050 hn^¾)은 현재 twLateral 그대로. */
export type TwSystemX = 'IMF' | 'SMF'
export type TwSystemY = 'OCBF' | 'SCBF'
export const TW_SYSTEMS_X: Record<TwSystemX, { R: number; hMax: number; row: string }> = {
  IMF: { R: 3.2, hMax: 12, row: '三、2.(1) 部分韌性抗彎矩構架（鋼造）' },
  SMF: { R: 4.8, hMax: Infinity, row: '三、1.(1) 特殊抗彎矩構架（鋼造）' },
}
export const TW_SYSTEMS_Y: Record<TwSystemY, { R: number; hMax: number; row: string }> = {
  OCBF: { R: 2.0, hMax: 12, row: '二、3.(2) 鋼造同心斜撐配置鋼造邊界構材' },
  SCBF: { R: 3.6, hMax: 50, row: '二、3.(5) 鋼造特殊同心斜撐配置鋼造邊界構材' },
}
export const systemXOf = (s: { systemX?: TwSystemX }): TwSystemX => s.systemX ?? 'IMF'
export const systemYOf = (s: { systemY?: TwSystemY }): TwSystemY => s.systemY ?? 'OCBF'
/** 표1-3 출처 — R 이 표값과 같으면 행 이름, 다르면 null (사용자 입력) */
export function systemSource(s: { systemX?: TwSystemX; systemY?: TwSystemY; Rx: number; Ry: number }) {
  const X = TW_SYSTEMS_X[systemXOf(s)], Y = TW_SYSTEMS_Y[systemYOf(s)]
  return { x: Math.abs(s.Rx - X.R) < 1e-9 ? X.row : null, y: Math.abs(s.Ry - Y.R) < 1e-9 ? Y.row : null, X, Y }
}
