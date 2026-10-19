import { ArrowRight, Play, FileText, FileDown, Ruler, Table2, RotateCcw } from 'lucide-react'
import { executeAction, openCurrentModel } from '../agent/session'
import { restoreBackup } from '../actions/build'
import { t } from '../i18n'
import { useStore } from '../state/store'
import { selectTask, tab } from '../state/ui'
import { isStale, TASKS, taskStatus, taskOfJob, unavailable } from '../state/taskFlow'
import { baySpans } from '../domain/types'
import { summarizeStatus } from '../domain/status'
import { checkScope } from '../domain/scope'
import { ArtifactList, ActivityHistory } from './ActivityViews'
import { StatusCard } from './Status'
import { RepairPanel } from './RepairPanel'

export function TaskStage({ onOpenMapi }: { onOpenMapi(): void }) {
  const s = useStore()
  if (s.task === 'model') return null
  if (s.task === 'history') return <ActivityHistory />
  const task = TASKS.find((x) => x.id === s.task)!
  const reason = unavailable(s, s.task)
  const state = taskStatus(s, s.task)
  const stale = isStale(s)
  const b = s.built
  const failed = !!s.lastFail && taskOfJob(s.lastFail.kind) === s.task && state !== 'done'
  const repairFailed=failed&&s.lastFail?.repair
  const done = s.task === 'analysis' ? s.analyzed : s.task === 'design' ? !!s.design : s.task === 'optimize' ? !!s.opt : false
  const summary = s.design ? summarizeStatus(s.design, s.connections, b ? checkScope(b.spec) : undefined) : null
  const ng = summary?.overall === 'fail'
  const run = () => void executeAction({ intent: s.task === 'analysis' ? 'analyze' : s.task === 'design' ? 'design' : 'optimize' })
  const next = () => selectTask(s.task === 'analysis' ? 'design' : 'outputs')
  return <div className="task-stage"><div className="task-content">
    <div className="task-heading"><div className="task-heading-meta"><span className={`task-state ${state}`}>{t(`flow_status_${state}`)}</span></div><h2 tabIndex={-1}>{t(task.label)}</h2><p>{t(task.hint)}</p></div>
    {b && <div className="task-model-summary"><span>{t('flow_summary')} · {b.spec.code} · {t('flow_revision', s.modelRevision)}</span><strong>{b.spec.span} × {baySpans(b.spec).reduce((a, x) => a + x, 0)} m</strong><small>{t('flow_model_summary', b.model.nodes.length, b.model.elements.length)}</small></div>}
    {reason && <div className="task-blocker" role="status"><span>{t(reason)}</span>{reason === 'flow_need_connection' ? <button className="btn btn-ghost" onClick={onOpenMapi}>{t('flow_connection')}</button> : !s.busy && reason !== 'busy' && <button className="btn btn-ghost" onClick={() => reason === 'need_anal' ? selectTask('analysis') : reason === 'flow_need_design' ? selectTask('design') : openCurrentModel()}>{t(reason === 'need_anal' ? 'wf_anal' : reason === 'flow_need_design' ? 'wf_design' : 'ws_edit')}</button>}</div>}
    {s.lastFail && failed && <div className="task-failure" role="alert"><strong>{t(s.lastFail.cancelled ? 'flow_status_cancelled' : 'flow_status_failed')}</strong><p>{s.lastFail.msg}</p>{s.restorePoint && <button className="btn btn-ghost" disabled={s.busy} onClick={() => void restoreBackup()}><RotateCcw size={14} />{t('wf_restore')}</button>}</div>}
    {repairFailed&&<p className="task-warning">{t('repair_recovery')}</p>}
    {s.task === 'analysis' && <>
      {s.analyzed && <div className="task-success">✓ {t('anal_done')}</div>}
      {s.reactions?.length ? <div className="task-stat-grid"><div><span>{t('res_react')}</span><strong>{s.reactions.length}</strong></div><div><span>{t('wf_anal')}</span><strong>{t(`flow_status_${stale ? 'stale' : s.analyzed ? 'done' : 'ready'}`)}</strong></div></div> : <div className="task-empty"><Play size={26} /><p>{t('flow_analysis_hint')}</p></div>}
      {s.reactions?.length ? <button className="btn btn-ghost" onClick={() => tab('resP')}>{t('flow_reactions')}</button> : null}
    </>}
    {(s.task==='design'||s.task==='optimize')&&<RepairPanel/>}
    {s.task === 'design' && <>{s.design && b ? <><StatusCard d={s.design} cs={s.connections} spec={b.spec} /><button className="btn btn-ghost" onClick={() => tab('resP')}>{t('flow_view_results')}</button></> : <div className="task-empty"><FileText size={26} /><p>{t('flow_design_hint')}</p></div>}{ng && <p className="task-warning">{t('flow_ng_note')}</p>}</>}
    {s.task === 'optimize' && <>{s.opt ? <><div className="task-stat-grid"><div><span>{t('op_before')} · {t('op_tons')}</span><strong>{s.opt.weightBefore.toFixed(2)}</strong></div><div><span>{t('op_after')} · {t('op_tons')}</span><strong>{s.opt.weightAfter.toFixed(2)}</strong></div></div>{b && s.design && <StatusCard d={s.design} cs={s.connections} spec={b.spec} />}<button className="btn btn-ghost" onClick={() => tab('resP')}>{t('flow_view_results')}</button></> : <div className="task-empty"><Ruler size={26} /><p>{t('flow_opt_empty')}</p></div>}</>}
    {s.task === 'outputs' && <>{ng && <p className="task-warning">{t('flow_ng_note')}</p>}<div className="output-grid">{([
      ['pdf', 'g_design_5', 'PDF', FileDown], ['report', 'btn_html', 'HTML', FileText], ['drawings', 'g_design_3', 'DXF', Ruler], ['quantities', 'g_design_6', 'CSV', Table2],
    ] as const).map(([intent, key, format, Icon]) => <button key={intent} disabled={!!reason} title={reason ? t(reason) : undefined} onClick={() => void executeAction({ intent })}><Icon size={25} /><strong>{t(key)}</strong><span>{format}</span></button>)}</div><p className="ws-start-note">{t('flow_output_note')}</p><ArtifactList /></>}
  </div>
    {s.task !== 'outputs' && !repairFailed && <div className="task-primary-row"><button className="btn btn-c" disabled={done && !stale ? s.busy || !!s.confirm : !!reason} onClick={done && !stale ? next : run}>{done && !stale ? <ArrowRight size={16} /> : <Play size={16} />}{t(done && !stale ? s.task === 'analysis' ? 'flow_next_design' : 'flow_next_outputs' : failed ? 'flow_retry' : s.task === 'analysis' ? 'flow_run_analysis' : s.task === 'design' ? 'flow_run_design' : 'flow_run_opt')}</button>{done && <button className="btn btn-ghost" disabled={!!reason} onClick={run}>{t(s.task === 'analysis' ? 'flow_run_analysis' : s.task === 'design' ? 'flow_run_design' : 'flow_run_opt')}</button>}{s.task === 'design' && s.design && <button className="btn btn-ghost" onClick={() => selectTask('optimize')}>{t('flow_optimize')}</button>}</div>}
  </div>
}
