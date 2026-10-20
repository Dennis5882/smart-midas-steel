/* 「등급을 올리려면 확인할 것」 목록 (순수) — 결과 카드·계산서 상태 상자·簽證 대응표가 같은 목록을 쓴다.
   흩어진 사유(부재 횡지지 가정·적용범위 경고·접합 시험 근거·냉간성형 예비)를 세 묶음으로 모은다.
   confirm  : 입력을 확인·변경하면 풀리는 것 — field = 이동할 입력 칸(planFields path)
   evidence : 앱 밖 근거가 있어야 하는 것 (처마 회전능력 시험 13.6.1, 기초·접합 상세) — 늘 남는다
   limit    : 앱 검토 범위 밖이라 등급이 유지되는 것 (냉간성형 예비검토, 형식별 전문가 검토 경고)
   NG(강도비 > 1)는 여기 넣지 않는다 — 설계 검토 화면의 NG 보완(RepairPanel)·최적화가 담당. */
import type { ConnResult } from './connections'
import type { DesignResult } from './design'
import type { ScopeIssue, ScopeKey, ScopeResult } from './scope'
import { connGrade, memberGrade, type Reason } from './status'
import type { FactorySpec } from './types'
import { restraintKeys, support } from './validity'

export type ActionGroup = 'confirm' | 'evidence' | 'limit'
export const ACTION_GROUPS: ActionGroup[] = ['confirm', 'evidence', 'limit']
export interface ActionItem {
  id: string
  group: ActionGroup
  /** 부재·접합 사유에서 온 항목 */
  reason?: Reason
  /** 적용범위 경고에서 온 항목 */
  scope?: ScopeIssue
  /** 영향받는 부재·접합 수 (적용범위 경고는 0) */
  members: number
  conns: number
  /** 이동할 입력 칸 (planFields path) */
  field?: string
}

/** 입력으로 풀 수 있는 적용범위 경고 → 입력 칸 */
const SCOPE_FIELD: Partial<Record<ScopeKey, string>> = {
  siteAssumed: 'siteBasis', siteEvidence: 'siteEvidence', craneAssumed: 'additions.crane',
  twMatSS: 'material', twMatImported: 'material', twZPurlin: 'sections.purlin', twAsd: 'asd',
  interiorRigid: 'interiorColumns', twSystemSpecial: 'seismic.systemX', bayRatio: 'baySpacing', baySpacing: 'baySpacing',
}

export function actionItems(spec: FactorySpec, d: DesignResult | null, cs: ConnResult[] | null, scope: ScopeResult): ActionItem[] {
  const out: ActionItem[] = []
  const count = (r: Reason) => (d?.members ?? []).filter((m) => memberGrade(m).reasons.includes(r)).length
  const connCount = (r: Reason) => (cs ?? []).filter((c) => connGrade(c).reasons.includes(r)).length

  const restraint = count('restraint')
  const assumed = restraintKeys(spec).find((k) => support(spec, k) === 'assumed')
  if (restraint) out.push({ id: 'restraint', group: 'confirm', reason: 'restraint', members: restraint, conns: 0, ...(assumed ? { field: `restraints.${assumed}` } : {}) })
  for (const i of scope.issues) {
    if (i.level !== 'warn') continue
    const field = SCOPE_FIELD[i.key]
    out.push({ id: `scope:${i.key}`, group: field ? 'confirm' : 'limit', scope: i, members: 0, conns: 0, ...(field ? { field } : {}) })
  }
  for (const r of ['rotTest', 'gbDetail'] as const) {
    const n = connCount(r)
    if (n) out.push({ id: r, group: 'evidence', reason: r, members: 0, conns: n })
  }
  for (const r of ['coldFormed', 'addition'] as const) {
    const n = count(r)
    if (n) out.push({ id: r, group: 'limit', reason: r, members: n, conns: 0 })
  }
  return out
}
