/* 작업 흐름 상태 (순수) — 모델 → 해석 → 설계 검토 → 출력. 각 단계 상태와 '다음 할 일' 하나를 정한다.
   결과 최신 여부: Gen 에서 모델이 바뀌었거나(genChanged, F4 감지) 입력 카드가 Gen 에 보낸 스펙과 다르면(preview ≠ built) 이후 단계는 stale. */
import type { FactorySpec } from '../domain/types'
import type { Built, JobKind } from './store'

export type StepId = 'build' | 'anal' | 'design' | 'output'
export type StepStatus = 'done' | 'next' | 'todo' | 'stale' | 'failed' | 'running'
export type NextAction = 'start' | 'rebuild' | 'apply' | 'retry' | 'anal' | 'design' | 'output'

export interface WorkflowInput {
  built: Built | null; analyzed: boolean; hasDesign: boolean; ngCount: number
  preview: FactorySpec | null; genChanged: number
  job: JobKind | null; lastFail: { kind: JobKind; cancelled: boolean } | null
}
export interface Workflow { steps: Record<StepId, StepStatus>; next: NextAction | null; reason: 'none' | 'gen' | 'edited' | 'failed' | 'cancelled' }

const STEP_OF: Record<JobKind, StepId> = { build: 'build', anal: 'anal', design: 'design', opt: 'design', pdf: 'output', restore: 'build' }

/** 키 순서·undefined 와 무관한 비교 (카드의 toSpec·normalizeBays 가 키 순서를 바꿀 수 있음) */
const canon = (v: unknown): unknown => Array.isArray(v) ? v.map(canon)
  : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).filter((k) => (v as any)[k] !== undefined).sort().map((k) => [k, canon((v as any)[k])])) : v
export const specChanged = (a: FactorySpec | null, b: FactorySpec | null | undefined) => !!a && !!b && JSON.stringify(canon(a)) !== JSON.stringify(canon(b))

export function workflow(w: WorkflowInput): Workflow {
  const steps: Record<StepId, StepStatus> = {
    build: w.built ? 'done' : 'next',
    anal: w.analyzed ? 'done' : w.built ? 'next' : 'todo',
    design: w.hasDesign ? 'done' : w.analyzed ? 'next' : 'todo',
    output: w.hasDesign ? 'next' : 'todo',
  }
  let next: NextAction | null = !w.built ? 'start' : !w.analyzed ? 'anal' : !w.hasDesign ? 'design' : 'output'
  let reason: Workflow['reason'] = 'none'
  const edited = specChanged(w.preview, w.built?.spec)
  if (w.genChanged > 0 || edited) {
    /* 이후 단계 결과는 이전 모델·입력 기준 */
    for (const s of ['anal', 'design', 'output'] as const) if (steps[s] === 'done' || steps[s] === 'next') steps[s] = 'stale'
    steps.build = 'stale'
    next = w.genChanged > 0 ? 'rebuild' : 'apply'
    reason = w.genChanged > 0 ? 'gen' : 'edited'
  } else if (w.lastFail) {
    const s = STEP_OF[w.lastFail.kind] ?? 'build'
    steps[s] = 'failed'
    next = s === 'build' ? (w.built ? 'rebuild' : 'start') : 'retry'
    reason = w.lastFail.cancelled ? 'cancelled' : 'failed'
  }
  if (w.job) { steps[STEP_OF[w.job] ?? 'build'] = 'running'; next = null }
  return { steps, next, reason }
}
