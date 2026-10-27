import { ArrowRight, Building2, ChevronLeft, FolderOpen, Frame, Pencil } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { executeAction, openCurrentModel, setCode } from '../agent/session'
import { TEMPLATES, TEMPLATE_KEYS, type TemplateKey } from '../domain/templates'
import { defaultSpecFor } from '../domain/types'
import { t, useLang } from '../i18n'
import { S, codeForLang, notify, savedCode, useStore } from '../state/store'
import { draw3D } from '../state/ui'
import { JobBar } from './JobBar'
import { PlanCard } from './PlanCard'
import { ModelWizard } from './ModelWizard'
import { CodeSelect } from './CodeSelect'
import { NoticeCenter } from './ActivityViews'
import { TaskStage } from './TaskStage'
import { TASKS } from '../state/taskFlow'

/** The current editor stays mounted behind the start view, retaining even invalid raw inputs and the current step. */
export function Workspace({ guideCollapsed, onOpenGuide, onOpenMapi }: { guideCollapsed: boolean; onOpenGuide(): void; onOpenMapi(): void }) {
  const s = useStore()
  const lang = useLang()
  useEffect(() => {
    /* 새 작업 = 언어 기본 기준(번체 TW·간체 CN·한국어 KR, 영어는 고른 기준), 작업 중이면 기존 기준 유지 (store.codeForLang) */
    const want = codeForLang(lang, S.code, savedCode(), !!(S.activePlan || S.built))
    if (want !== S.code) void setCode(want, { auto: true })
  }, [lang])
  const plan = s.activePlan
  const restrictedCode = lang === 'zh-CN' && s.code !== 'CN'
  const editing = s.task === 'model' && s.workspaceView === 'model' && plan?.spec.code === s.code
  const locked = !!plan && (plan.epoch !== s.buildEpoch || !!(s.opt && (plan.modelRevision ?? 0) < s.modelRevision))
  const root = useRef<HTMLElement>(null)
  /* 시작 화면(위저드 1단계)의 기본 모델 선택 — 처음 값은 지금 편집기 템플릿 */
  const [pick, setPick] = useState<TemplateKey>(plan?.tpl ?? 'general')
  const startSpec = s.lastSpec.code === s.code ? s.lastSpec : defaultSpecFor(s.code)
  /* 같은 템플릿 = 지금 편집기 이어서, 다른 템플릿 = 새 모델링 (session 'new') */
  const startTemplate = (tpl: TemplateKey) => void executeAction({ intent: 'new', mode: 'template', tpl, params: {} })
  useEffect(() => { if (!editing && plan?.tpl) setPick(plan.tpl) }, [editing, plan?.tpl])
  useEffect(() => {
    const target = s.task !== 'model' ? root.current?.querySelector<HTMLElement>('.task-heading h2') : editing ? root.current?.querySelector<HTMLElement>('.mw-stage-heading h3, .ws-free-editor input') : root.current?.querySelector<HTMLElement>('.ws-start .mw-stage-heading h3')
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
    {/* 시작 화면 = 모델링 위저드 1단계 — 위쪽 띠에서 설계기준, 기본 모델(템플릿) 고르고 [다음 단계] → 편집기 2단계. 자유 골조는 아래 */}
    <div className="ws-start" hidden={!!editing || s.task !== 'model'}>
      <ModelWizard spec={startSpec} step={0} visited={0} disabled={s.busy || restrictedCode} blocked={false} invalid={false} attempted={false}
        onStep={() => startTemplate(pick)} onBuild={() => {}} codeControl={<CodeSelect />}>
        {restrictedCode && <p className="mw-note" role="status">{t('project_code_existing_hint')}</p>}
        {plan?.spec.code === s.code && <button className="ws-resume-card" disabled={s.busy} onClick={openCurrentModel}><FolderOpen size={20} /><span><strong>{t('ws_resume')}</strong><small>{t('ws_resume_hint')}</small></span><ArrowRight size={16} /></button>}
        <h4 className="ws-section-label">{t('ws_templates')}</h4>
        <div className="mw-templates">{TEMPLATE_KEYS.map((key) => <button type="button" key={key} aria-pressed={pick === key} disabled={s.busy || restrictedCode}
          onClick={() => setPick(key)} onDoubleClick={() => startTemplate(key)}>
          <strong>{t(`tpl_${key}`)}</strong><span>{TEMPLATES[key].span} m · {TEMPLATES[key].bays * TEMPLATES[key].baySpacing} m</span>
        </button>)}</div>
        <p className="mw-note">{t('mw_template_note')}</p>
        <button className="ws-free" disabled={s.busy || restrictedCode} onClick={() => void executeAction({ intent: 'new', mode: 'free', params: {} })}><Frame size={19} /><span><strong>{t('g_model_5')}</strong><small>{t('ws_free_hint')}</small></span></button>
        <p className="ws-start-note">{t('ws_local_note')}</p>
      </ModelWizard>
    </div>
    {plan && <div className={`ws-editor${plan.mode === 'free' ? ' ws-free-editor' : ''}`} hidden={!editing}>
      {plan.mode === 'free' && <div className="project-code-summary"><span>{t('code_label')}</span><CodeSelect /></div>}
      {locked && <div className="ws-edit-again"><span>{t('ws_model_sent')}</span><button className="btn btn-c" disabled={s.busy} onClick={openCurrentModel}><Pencil size={13} />{t('ws_edit')}</button></div>}
      <PlanCard key={plan.id} msg={plan} />
    </div>}
    <TaskStage onOpenMapi={onOpenMapi} />
    <JobBar />
  </section>
}
