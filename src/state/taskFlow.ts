/** Shared button availability and stage states. Viewing a stage never runs a job. */
import type { AppState, TaskId } from './store'
import { specChanged } from './workflow'
import type { I18nKey } from '../i18n'

export const TASKS: { id: Exclude<TaskId, 'history'>; label: I18nKey; hint: I18nKey }[] = [
  { id: 'model', label: 'flow_model', hint: 'flow_model_hint' },
  { id: 'analysis', label: 'wf_anal', hint: 'flow_analysis_hint' },
  { id: 'design', label: 'wf_design', hint: 'flow_design_hint' },
  { id: 'optimize', label: 'flow_optimize', hint: 'flow_optimize_hint' },
  { id: 'outputs', label: 'flow_outputs', hint: 'flow_outputs_hint' },
]
type FlowState = Pick<AppState, 'busy' | 'confirm' | 'built' | 'analyzed' | 'design' | 'connections' | 'opt' | 'job' | 'lastFail' | 'genChanged' | 'draftSpec' | 'draftInvalid' | 'mapiKey' | 'activity' | 'modelRevision' | 'resultRevision'>
export const taskOfJob = (kind: string): TaskId => ({ build: 'model', restore: 'model', anal: 'analysis', design: 'design', opt: 'optimize', pdf: 'outputs' }[kind] as TaskId ?? 'model')
export const isStale = (s: Pick<FlowState, 'built' | 'genChanged' | 'draftSpec' | 'draftInvalid'>) => !!s.built && (s.genChanged > 0 || s.draftInvalid || specChanged(s.draftSpec, s.built.spec))

export function unavailable(s: FlowState, task: TaskId): I18nKey | null {
  if (s.busy || s.confirm) return 'busy'
  if (task === 'model' || task === 'history') return null
  if (!s.built) return 'flow_need_model'
  if (s.genChanged) return 'wf_stale_gen'
  if (s.draftInvalid) return 'flow_invalid_draft'
  if (isStale(s)) return 'wf_stale_edited'
  if (task !== 'analysis' && !s.analyzed) return 'need_anal'
  if ((task === 'optimize' || task === 'outputs') && (!s.design || !s.connections)) return 'flow_need_design'
  if (task !== 'outputs' && !s.mapiKey.trim()) return 'flow_need_connection'
  return null
}

export type TaskStatus = 'todo' | 'ready' | 'done' | 'running' | 'failed' | 'cancelled' | 'stale'
export function taskStatus(s: FlowState, task: TaskId): TaskStatus {
  if (s.job && taskOfJob(s.job.kind) === task) return 'running'
  if (isStale(s)) return 'stale'
  if (s.lastFail && taskOfJob(s.lastFail.kind) === task) return s.lastFail.cancelled ? 'cancelled' : 'failed'
  if (task === 'model') return s.built ? 'done' : 'ready'
  if (task === 'analysis' && s.analyzed || task === 'design' && s.design || task === 'optimize' && s.opt) return 'done'
  if (task === 'outputs' && s.activity.some((a) => a.source === 'artifact' && a.revision === s.modelRevision && a.resultRevision === s.resultRevision)) return 'done'
  // Connection setup is an execution prerequisite, not a completed workflow stage.
  return unavailable({ ...s, mapiKey: 'readiness' }, task) ? 'todo' : 'ready'
}
