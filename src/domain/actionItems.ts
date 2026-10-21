/* 「등급을 올리려면 확인할 것」 목록 (순수) — 결과 카드·계산서 상태 상자·簽證 대응표가 같은 목록을 쓴다.
   흩어진 사유(부재 횡지지 가정·적용범위 경고·접합 시험 근거·냉간성형 예비)를 세 묶음으로 모은다.
   confirm  : 입력을 확인·변경하면 풀리는 것 — field = 이동할 입력 칸(planFields path)
   evidence : 앱 밖 근거가 있어야 하는 것 (처마 회전능력 시험 13.6.1, 기초·접합 상세) — 늘 남는다
   limit    : 앱 검토 범위 밖이라 등급이 유지되는 것 (냉간성형 예비검토, 형식별 전문가 검토 경고, 생성 뒤 범위 밖이 된 block)
   NG(강도비 > 1)는 여기 넣지 않는다 — 설계 검토 화면의 NG 보완(RepairPanel)·최적화가 담당.
   부재 수백 개를 등급마다 다시 훑으므로 같은 (spec, 설계, 접합) 객체면 결과를 재사용한다 (결과 객체는 회수 뒤 바꾸지 않음). */
import { systemXOf } from '../codes/twSystems'
import type { ConnResult } from './connections'
import type { DesignResult } from './design'
import type { ScopeIssue, ScopeKey, ScopeResult } from './scope'
import { connGrade, memberGrade, type Reason } from './status'
import type { FactorySpec } from './types'
import { restraintKeys } from './validity'

export type ActionGroup = 'confirm' | 'evidence' | 'limit'
export const ACTION_GROUPS: ActionGroup[] = ['confirm', 'evidence', 'limit']
export interface ActionItem {
  id: string
  group: ActionGroup
  /** 부재·접합 사유에서 온 항목 */
  reason?: Reason
  /** 적용범위 이슈에서 온 항목 (warn·block) */
  scope?: ScopeIssue
  /** 영향받는 부재·접합 수 (적용범위 이슈는 0) */
  members: number
  conns: number
  /** 이동할 입력 칸 (planFields path) */
  field?: string
}

/** 입력으로 풀 수 있는 적용범위 경고 → 입력 칸 (스펙에 따라 달라지는 것은 함수) */
const SCOPE_FIELD: Partial<Record<ScopeKey, string | ((s: FactorySpec) => string)>> = {
  siteAssumed: 'siteBasis', siteEvidence: 'siteEvidence', craneAssumed: 'additions.crane',
  twMatSS: 'material', twMatImported: 'material', twZPurlin: 'sections.purlin', twAsd: 'asd',
  interiorRigid: 'interiorColumns', pedestal: 'pedestal.height', pedestalHigh: 'pedestal.height', pedestalAdditions: 'pedestal.height',
  /* X 가 특수(SMF)면 X, 아니면 Y(SCBF) 가 원인 */
  twSystemSpecial: (s) => systemXOf(s.seismic) === 'SMF' ? 'seismic.systemX' : 'seismic.systemY',
  /* 불균등 베이(개별 간격·자유골조)면 간격 목록, 등간격이면 간격 칸 */
  bayRatio: (s) => s.bayList?.length ? 'bayList' : 'baySpacing',
  baySpacing: (s) => s.bayList?.length ? 'bayList' : 'baySpacing',
}

let memo: { spec: FactorySpec; d: DesignResult | null; cs: ConnResult[] | null; issues: string; out: ActionItem[] } | null = null

export function actionItems(spec: FactorySpec, d: DesignResult | null, cs: ConnResult[] | null, scope: ScopeResult): ActionItem[] {
  const issues = JSON.stringify(scope.issues)
  if (memo && memo.spec === spec && memo.d === d && memo.cs === cs && memo.issues === issues) return memo.out
  const out = build(spec, d, cs, scope)
  memo = { spec, d, cs, issues, out }
  return out
}

function build(spec: FactorySpec, d: DesignResult | null, cs: ConnResult[] | null, scope: ScopeResult): ActionItem[] {
  const out: ActionItem[] = []
  const members = d?.members ?? []
  const count = (r: Reason) => members.filter((m) => memberGrade(m).reasons.includes(r)).length
  const connCount = (r: Reason) => (cs ?? []).filter((c) => connGrade(c).reasons.includes(r)).length

  /* 횡지지 — 실제로 부재에 붙은 사유의 키(issue.detail)로 이동한다 (가정이어도 영향이 없는 키는 고르지 않음) */
  const restraint = count('restraint')
  if (restraint) {
    const hit = new Set(members.flatMap((m) => (m.issues ?? []).filter((i) => i.key === 'restraint').map((i) => i.detail)))
    const key = restraintKeys(spec).find((k) => hit.has(k))
    out.push({ id: 'restraint', group: 'confirm', reason: 'restraint', members: restraint, conns: 0, ...(key ? { field: `restraints.${key}` } : {}) })
  }
  for (const i of scope.issues) {
    /* block 은 생성 전에 막지만, 생성 뒤 규칙이 바뀌었거나 복원된 모델이면 결과에도 남긴다 */
    const f = i.level === 'warn' ? SCOPE_FIELD[i.key] : undefined
    const field = typeof f === 'function' ? f(spec) : f
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
