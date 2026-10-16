import { ArrowRight, Building2, ChevronLeft, FolderOpen, Frame, Pencil } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { executeAction, openCurrentModel, setCode } from '../agent/session'
import { CODE_IDS, PROFILES, type CodeId } from '../codes'
import { TEMPLATES, TEMPLATE_KEYS } from '../domain/templates'
import { t, useLang } from '../i18n'
import { S, codeForLang, notify, savedCode, useStore } from '../state/store'
import { draw3D } from '../state/ui'
import { JobBar } from './JobBar'
import { PlanCard } from './PlanCard'
import { NoticeCenter } from './ActivityViews'
import { TaskStage } from './TaskStage'
import { TASKS } from '../state/taskFlow'

/** The current editor stays mounted behind the start view, retaining even invalid raw inputs and the current step. */
export function Workspace({ guideCollapsed, onOpenGuide, onOpenMapi }: { guideCollapsed: boolean; onOpenGuide(): void; onOpenMapi(): void }) {
  const s = useStore()
  const lang = useLang()
  useEffect(() => {
    /* 간체 = 새 작업 CN 만, 작업 중이면 기존 기준 유지, 그 밖 언어 = 사용자가 고른 기준 (store.codeForLang) */
    const want = codeForLang(lang, S.code, savedCode(), !!(S.activePlan || S.built))
    if (want !== S.code) void setCode(want, { auto: true })
  }, [lang])
  const plan = s.activePlan
  const restrictedCode = lang === 'zh-CN' && s.code !== 'CN'
  const availableCodes = lang === 'zh-CN' ? (['CN'] as const) : CODE_IDS
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
      <div className="ws-hero"><span className="ws-kicker">{t('ws_kicker')}</span><h2 tabIndex={-1}>{t('project_start_title')}</h2><p>{t('project_start_hint')}</p></div>
      <section className="project-code" aria-labelledby="project-code-heading"><h3 id="project-code-heading" className="ws-section-label">01 · {t('code_label')}</h3><p>{t('project_code_hint')}</p><select aria-label={t('code_label')} value={restrictedCode ? '' : s.code} disabled={s.busy || !!s.confirm} onChange={(e) => void setCode(e.target.value as CodeId)}>{restrictedCode && <option value="" disabled>{t('project_code_existing')}</option>}{availableCodes.map((id) => <option key={id} value={id}>{t(PROFILES[id].labelKey)}</option>)}</select>{restrictedCode && <p role="status">{t('project_code_existing_hint')}</p>}</section>
      {plan?.spec.code === s.code && <button className="ws-resume-card" disabled={s.busy} onClick={openCurrentModel}><FolderOpen size={20} /><span><strong>{t('ws_resume')}</strong><small>{t('ws_resume_hint')}</small></span><ArrowRight size={16} /></button>}
      <h3 className="ws-section-label">02 · {t('ws_templates')}</h3>
      <div className="ws-template-grid">{TEMPLATE_KEYS.map((key, i) => <button className="ws-template" key={key} disabled={s.busy || restrictedCode} onClick={() => void executeAction({ intent: 'new', mode: 'template', tpl: key, params: {} })}>
        <span className="ws-template-icon"><Building2 size={21} /><small>{String(i + 1).padStart(2, '0')}</small></span>
        <strong>{t(`tpl_${key}`)}</strong><span className="ws-template-dims">{TEMPLATES[key].span} × {TEMPLATES[key].bays * TEMPLATES[key].baySpacing} m</span>
        <span className="ws-template-desc">{t(`tpl_${key}_desc`)}</span><span className="ws-template-go">{t('ws_begin')}<ArrowRight size={13} /></span>
      </button>)}</div>
      <button className="ws-free" disabled={s.busy || restrictedCode} onClick={() => void executeAction({ intent: 'new', mode: 'free', params: {} })}><Frame size={22} /><span><strong>{t('g_model_5')}</strong><small>{t('ws_free_hint')}</small></span><ArrowRight size={15} /></button>
      <p className="ws-start-note">{t('ws_local_note')}</p>
    </div>
    {plan && <div className={`ws-editor${plan.mode === 'free' ? ' ws-free-editor' : ''}`} hidden={!editing}>
      <div className="project-code-summary"><span>{t('code_label')} · <strong>{t(PROFILES[plan.spec.code].labelKey)}</strong></span><button className="btn btn-ghost" disabled={s.busy || !!s.confirm} onClick={home}>{t('project_code_change')}</button></div>
      {locked && <div className="ws-edit-again"><span>{t('ws_model_sent')}</span><button className="btn btn-c" disabled={s.busy} onClick={openCurrentModel}><Pencil size={13} />{t('ws_edit')}</button></div>}
      <PlanCard key={plan.id} msg={plan} />
    </div>}
    <TaskStage onOpenMapi={onOpenMapi} />
    <JobBar />
  </section>
}
