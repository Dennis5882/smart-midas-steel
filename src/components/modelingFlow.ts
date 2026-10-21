import type { ScopeKey } from '../domain/scope'
import type { FactorySpec } from '../domain/types'

export const MODEL_STEPS = ['mw_scope','mw_frame','mw_bays','mw_sections','mw_additions','mw_loads','mw_review'] as const
export const ADDITIONS_STEP = 4, LOADS_STEP = 5, REVIEW_STEP = MODEL_STEPS.length - 1
/** 입력 변경 → 3D·풍하중 미리보기 재계산 지연 (모델·하중을 다시 만드는 미리보기 공통) */
export const PREVIEW_DEBOUNCE_MS = 250
/** 마법사 단계별 3D 시점 (현지 요청 2026-10-21) — 1 시작·2 횡단면 = 정면, 3 길이·베이·4 재료·단면 = 측면, 5 추가 구조 = ISO, 6·7 은 바꾸지 않음(사용자 자유) */
export const STEP_CAM: readonly ('front' | 'side' | 'iso')[] = ['front', 'front', 'side', 'side', 'iso']
export const BAYS_STEP = MODEL_STEPS.indexOf('mw_bays'), SECTIONS_STEP = MODEL_STEPS.indexOf('mw_sections')
export const ADDITION_PARTS = ['crane','platform','opening','link','equipment'] as const
export type AdditionPart = typeof ADDITION_PARTS[number] | 'factors'
export function additionPartActive(s: FactorySpec, part: AdditionPart): boolean {
  const a=s.additions
  switch(part) {
    case 'crane': return !!s.features?.crane
    case 'platform': return !!s.features?.mezzanine
    case 'opening': return !!(s.features?.opening || a?.roofOpening || (s.features?.mezzanine && a?.floorOpening))
    case 'link': return !!a?.link
    case 'equipment': return !!a?.equipment.length
    case 'factors': return !!(s.features?.crane || s.features?.mezzanine || a?.link?.mode==='sliding')
  }
}
export function additionPartForPath(path: string): AdditionPart {
  const key = path.replace(/^additions\./,'').split('.')[0]
  return key === 'wallOpening' || key === 'roofOpening' || key === 'floorOpening' ? 'opening'
    : key === 'crane' || key === 'platform' || key === 'link' || key === 'equipment' ? key : 'factors'
}
/** A future stage's incomplete inputs must not trap users before they can reach that stage. */
export function scopeIssueStep(key: ScopeKey): number {
  if (['additionInput','additionReview','openingCN','opening','crane','mezzanine'].includes(key)) return ADDITIONS_STEP
  if (key === 'cn' || key === 'kr') return LOADS_STEP
  if (key.startsWith('pedestal')) return SECTIONS_STEP
  if (key === 'baySpacing' || key === 'bayRatio' || key === 'length') return 2
  return 1
}
