/* 기초 예비검토 — 현재 Gen 결과(지점별 케이스 반력)와 결과 탭 입력으로 바로 계산 (TW, 추가 구조 없을 때) */
import { twFootings, type FootingResult } from '../domain/twFoundation'
import { S } from './store'

export type FootingState = { kind: 'result'; result: FootingResult } | { kind: 'unavailable' | 'additions' | 'invalid' | 'none' }
export function footingState(): FootingState {
  const b = S.built
  if (!b || b.spec.code !== 'TW' || !S.reactions?.length) return { kind: 'none' }
  if (b.info.additions) return { kind: 'additions' }
  if (!S.baseReactions?.size) return { kind: 'unavailable' }
  const result = twFootings(b.spec, b.model, b.cases, b.info.wind.variants, S.baseReactions, S.footingInput)
  return result ? { kind: 'result', result } : { kind: 'invalid' }
}
