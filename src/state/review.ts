/* 簽證 심사 대응표 — 현재 Gen 결과·검토 상태로 (TW). 사유는 S.reviewReasons 가 기본 사유를 덮는다 */
import { checkScope } from '../domain/scope'
import { sectionProps } from '../domain/sections'
import { reviewItems, type ReviewItem } from '../domain/twReview'
import { actionItems } from '../domain/actionItems'
import { footingState } from './footing'
import { S } from './store'

export function currentReview(): ReviewItem[] {
  const b = S.built
  if (!b || b.spec.code !== 'TW') return []
  const cf = [b.spec.sections.purlin, b.spec.sections.girt].some((n) => { try { return ['CC', 'Z'].includes(sectionProps(n, 'TW').kind) } catch { return false } })
  const scope = checkScope(b.spec)
  const restraintMembers = actionItems(b.spec, S.design, S.connections, scope).find((a) => a.id === 'restraint')?.members ?? 0
  return reviewItems({ spec: b.spec, issues: scope.issues, design: !!S.design, restraintMembers, connections: !!S.connections?.length, footing: footingState().kind === 'result', coldFormed: cf })
}
