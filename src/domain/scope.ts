/* 적용범위 게이트 (평가 보고서 P0-4, 기획서 14장) — 자동설계가 맞는 건물인지 Gen 전송 전에 판정한다.
   block: 이 앱의 모델·하중으로는 표현할 수 없음 → [실행] 막음 (전문가 모드 = Gen NX 에서 직접 모델링)
   warn : 모델은 만들지만 가정이 흔들림 → 실행 가능, 결과 상태·계산서에 남김
   공통 범위: 단층 단경간 박공 문형 골조, 일정 횡단면, 경량 지붕·벽, 크레인·메자닌 없음.
   CN 의 세부 범위는 validateCnSpec(GB 표 적용 한계) 을 그대로 쓴다. */
import { validateCnSpec } from './cnLoads'
import { portalGeometry } from './portal'
import type { FactorySpec } from './types'

export type ScopeKey =
  | 'crane' | 'mezzanine' | 'multiSpan' | 'opening' | 'openingCN'
  | 'span' | 'eave' | 'slope' | 'bayRatio' | 'baySpacing' | 'length' | 'hnR' | 'cn'
export interface ScopeIssue { key: ScopeKey; level: 'block' | 'warn'; args: (string | number)[] }
export interface ScopeResult { issues: ScopeIssue[]; blocked: boolean }

/** 스펙에 없는 건물 특성 — 편집 카드 '적용범위' 체크 */
export interface ScopeFeatures { crane: boolean; mezzanine: boolean; multiSpan: boolean; opening: boolean }
export const NO_FEATURES: ScopeFeatures = { crane: false, mezzanine: false, multiSpan: false, opening: false }

const r2 = (x: number) => +x.toFixed(2)
/** 치수 한계 (block) — 입력 위저드도 같은 값으로 해당 칸에서 바로 막는다 (components/planFields) */
export const LIMITS = { span: 60, eave: 18, slope: 1 } as const

export function checkScope(spec: FactorySpec, f: ScopeFeatures = spec.features ?? NO_FEATURES): ScopeResult {
  const out: ScopeIssue[] = []
  const block = (key: ScopeKey, ...args: (string | number)[]) => out.push({ key, level: 'block', args })
  const warn = (key: ScopeKey, ...args: (string | number)[]) => out.push({ key, level: 'warn', args })
  const G = portalGeometry(spec)

  /* 앱이 모델링하지 않는 구조 */
  if (f.crane) block('crane')
  if (f.mezzanine) block('mezzanine')
  if (f.multiSpan) block('multiSpan')
  /* 큰 개구부: TW 는 부분 밀폐(GCpi ±0.55)로 근사 가능 — 개구부 골조는 별도. CN 은 폐쇄형만 */
  if (f.opening) {
    if (spec.code === 'CN') block('openingCN')
    else warn('opening', spec.wind.enclosure === 'partial' ? 1 : 0)
  }

  /* 치수 한계 */
  if (!(spec.span > 0 && spec.span <= LIMITS.span)) block('span', spec.span)
  if (!(spec.eaveHeight > 0 && spec.eaveHeight <= LIMITS.eave)) block('eave', spec.eaveHeight)
  if (!(spec.roofSlope > 0 && spec.roofSlope <= LIMITS.slope)) block('slope', spec.roofSlope)
  const spans = G.spans
  const ratio = Math.max(...spans) / Math.min(...spans)
  if (ratio > 1.5) warn('bayRatio', r2(Math.min(...spans)), r2(Math.max(...spans)))
  if (Math.max(...spans) > 9) warn('baySpacing', r2(Math.max(...spans)))
  if (spec.code === 'TW' && G.length > 90) warn('length', r2(G.length))
  /* TW 표1-3 R(Rx 3.2·Ry 2.0)은 h ≤ 12 m 조건 — 넘으면 구조계 R 재확인 */
  const hn = spec.eaveHeight + G.rise / 2
  if (spec.code === 'TW' && hn > 12) warn('hnR', r2(hn))

  /* CN: GB 표 적용 한계 (validateCnSpec 메시지 그대로) */
  if (spec.code === 'CN') {
    try { validateCnSpec(spec) } catch (e) { block('cn', e instanceof Error ? e.message : String(e)) }
  }
  /* 같은 사유 중복 제거 (CN 은 스팬·처마·경사가 validateCnSpec 에도 걸림 → 일반 항목만 남김) */
  const dim = out.some((y) => y.key === 'span' || y.key === 'eave' || y.key === 'slope')
  const issues = out.filter((x) => !(x.key === 'cn' && dim))
  return { issues, blocked: issues.some((x) => x.level === 'block') }
}
