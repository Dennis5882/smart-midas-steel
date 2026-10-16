import { ArrowRight, Building2, ChevronLeft, FolderOpen, Frame, Pencil } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { executeAction, openCurrentModel } from '../agent/session'
import { TEMPLATES, TEMPLATE_KEYS } from '../domain/templates'
import { t, useLang } from '../i18n'
import { S, notify, useStore } from '../state/store'
import { draw3D } from '../state/ui'
import { JobBar } from './JobBar'
import { PlanCard } from './PlanCard'
import { NoticeCenter } from './ActivityViews'
import { TaskStage } from './TaskStage'
import { TASKS } from '../state/taskFlow'

/** The current editor stays mounted behind the start view, retaining even invalid raw inputs and the current step. */
export function Workspace({ guideCollapsed, onOpenGuide, onOpenMapi }: { guideCollapsed: boolean; onOpenGuide(): void; onOpenMapi(): void }) {
  const s = useStore()
  useLang()
  const plan = s.activePlan
  const editing = s.task === 'model' && s.workspaceView === 'model' && plan?.spec.code === s.code
  const locked = !!plan && (plan.epoch !== s.buildEpoch || !!(s.opt && (plan.modelRevision ?? 0) < s.modelRevision))
  const root = useRef<HTMLElement>(null)
  useEffect(() => {
    const target = s.task !== 'model' ? root.current?.querySelector<HTMLElement>('.task-heading h2') : editing ? root.current?.querySelector<HTMLElement>('.mw-stage-heading h3, .ws-free-editor input') : root.current?.querySelector<HTMLElement>('.ws-hero h2')
    target?.focus({ preventScroll: true })
  }, [editing, s.task])
  const home = () => { S.workspaceView = 'start'; if (S.preview) draw3D(); notify() }
  return <section ref={root} className={`workspace${guideCollapsed ? ' g-closed' : ''}`} aria-label={t('ws_title')}>
    <div className="ws-toolbar">
      <div className="ws-toolbar-title">{guideCollapsed && <button className="btn btn-ghost" onClick={onOpenGuide} aria-label={t('guide_open')}>☰</button>}<Building2 size={16} /><strong>{t(s.task === 'history' ? 'flow_history' : TASKS.find((x) => x.id === s.task)!.label)}</strong></div>
      <div className="ws-toolbar-actions">
        {editing ? <button className="btn btn-ghost" disabled={s.busy} onClick={home}><ChevronLeft size={13} />{t('ws_home')}</button>
          : (plan || s.built) && <button className="btn btn-ghost" disabled={s.busy} onClick={openCurrentModel}><Pencil size={13} />{t('ws_resume')}</button>}
      </div>
    </div>
    <NoticeCenter />
    <div className="ws-start" hidden={!!editing || s.task !== 'model'}>
      <div className="ws-hero"><span className="ws-kicker">{t('ws_kicker')}</span><h2 tabIndex={-1}>{t('ws_start_title')}</h2><p>{t('ws_start_hint')}</p><span className="ws-standard">{s.code} · {t('code_label')}</span></div>
      {plan?.spec.code === s.code && <button className="ws-resume-card" disabled={s.busy} onClick={openCurrentModel}><FolderOpen size={20} /><span><strong>{t('ws_resume')}</strong><small>{t('ws_resume_hint')}</small></span><ArrowRight size={16} /></button>}
      <h3 className="ws-section-label">{t('ws_templates')}</h3>
      <div className="ws-template-grid">{TEMPLATE_KEYS.map((key, i) => <button className="ws-template" key={key} disabled={s.busy} onClick={() => void executeAction({ intent: 'new', mode: 'template', tpl: key, params: {} })}>
        <span className="ws-template-icon"><Building2 size={21} /><small>{String(i + 1).padStart(2, '0')}</small></span>
        <strong>{t(`tpl_${key}`)}</strong><span className="ws-template-dims">{TEMPLATES[key].span} × {TEMPLATES[key].bays * TEMPLATES[key].baySpacing} m</span>
        <span className="ws-template-desc">{t(`tpl_${key}_desc`)}</span><span className="ws-template-go">{t('ws_begin')}<ArrowRight size={13} /></span>
      </button>)}</div>
      <button className="ws-free" disabled={s.busy} onClick={() => void executeAction({ intent: 'new', mode: 'free', params: {} })}><Frame size={22} /><span><strong>{t('g_model_5')}</strong><small>{t('ws_free_hint')}</small></span><ArrowRight size={15} /></button>
      <p className="ws-start-note">{t('ws_local_note')}</p>
    </div>
    {plan && <div className={`ws-editor${plan.mode === 'free' ? ' ws-free-editor' : ''}`} hidden={!editing}>
      {locked && <div className="ws-edit-again"><span>{t('ws_model_sent')}</span><button className="btn btn-c" disabled={s.busy} onClick={openCurrentModel}><Pencil size={13} />{t('ws_edit')}</button></div>}
      <PlanCard key={plan.id} msg={plan} />
    </div>}
    <TaskStage onOpenMapi={onOpenMapi} />
    <JobBar />
  </section>
}
