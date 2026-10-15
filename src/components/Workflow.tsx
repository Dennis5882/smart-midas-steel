/* 작업 흐름 띠 — 입력창 위. 모델 → 해석 → 설계 검토 → 출력 상태와 '다음' 버튼 하나(+ 보조).
   명령을 몰라도 생성부터 출력까지 진행하고, Gen 변경·입력 변경으로 이전 결과가 된 단계는 '이전 결과' 로 표시 (state/workflow). */
import { runCmd } from '../agent/session'
import { t, type I18nKey } from '../i18n'
import { S, useStore } from '../state/store'
import { addPlanMsg, previewSpec, tab } from '../state/ui'
import { workflow, type StepId, type StepStatus } from '../state/workflow'

const STEPS: [StepId, I18nKey][] = [['build', 'wf_build'], ['anal', 'wf_anal'], ['design', 'wf_design'], ['output', 'wf_output']]
const MARK: Record<StepStatus, string> = { done: '✓', next: '›', todo: '·', stale: '!', failed: '✕', running: '…' }

/** 마지막 스펙으로 자유골조 편집 카드를 다시 연다 — 확인 후 [실행] (Gen 모델을 앱 입력대로 다시 만듦) */
function reopenCard() {
  const spec = S.built?.spec ?? S.lastSpec
  addPlanMsg(spec, 'free')
  tab('viewP')
  previewSpec(spec)
}

export function Workflow() {
  const s = useStore()
  const w = workflow({
    built: s.built, analyzed: s.analyzed, hasDesign: !!s.design, ngCount: s.design?.ng ?? 0,
    preview: s.preview, genChanged: s.genChanged, job: s.job?.kind ?? null, lastFail: s.lastFail,
  })
  const cmd = (k: I18nKey) => () => void runCmd(t(k))
  const act: Record<string, { label: I18nKey; run: () => void } | undefined> = {
    start: { label: 'wf_go_start', run: cmd('g_model_2_cmd') },
    rebuild: { label: 'wf_go_rebuild', run: reopenCard },
    retry: s.lastFail ? { label: 'wf_go_retry', run: cmd(s.lastFail.kind === 'anal' ? 'g_analysis_1_cmd' : s.lastFail.kind === 'opt' ? 'g_design_4_cmd' : s.lastFail.kind === 'pdf' ? 'g_design_5_cmd' : 'g_design_1_cmd') } : undefined,
    anal: { label: 'wf_go_anal', run: cmd('g_analysis_1_cmd') },
    design: { label: 'wf_go_design', run: cmd('g_design_1_cmd') },
    output: { label: 'wf_go_pdf', run: cmd('g_design_5_cmd') },
  }
  const main = w.next ? act[w.next] : undefined
  const hint: I18nKey | null = w.reason === 'gen' ? 'wf_hint_gen' : w.reason === 'edited' ? 'wf_hint_edited' : w.reason === 'failed' ? 'wf_hint_failed'
    : w.reason === 'cancelled' ? 'wf_hint_cancelled' : w.next === 'start' ? 'wf_hint_start' : w.next === 'output' && (s.design?.ng ?? 0) > 0 ? 'wf_hint_ng' : null
  return (
    <nav className="wflow" aria-label={t('wf_title')}>
      <ol>
        {STEPS.map(([id, label]) => (
          <li key={id} className={`wf-${w.steps[id]}`} aria-current={w.steps[id] === 'next' || w.steps[id] === 'running' ? 'step' : undefined}>
            <span className="wf-mark" aria-hidden>{MARK[w.steps[id]]}</span>{t(label)}
            {(w.steps[id] === 'stale' || w.steps[id] === 'failed') && <span className="sr-only"> ({t(w.steps[id] === 'stale' ? 'wf_stale' : 'wf_failed')})</span>}
          </li>
        ))}
      </ol>
      {(hint || main) && (
        <div className="wf-row">
          {hint && <span className="wf-hint">{t(hint)}</span>}
          {main && <button className="btn btn-c wf-go" disabled={s.busy} onClick={main.run}>{t(main.label)}</button>}
          {w.next === 'output' && <button className="btn btn-ghost wf-go" disabled={s.busy} onClick={cmd('g_design_4_cmd')}>{t('g_design_4')}</button>}
        </div>
      )}
    </nav>
  )
}

/** 결과 탭 상단 — 결과가 이전 모델·입력 기준이면 경고 */
export function StaleBanner() {
  const s = useStore()
  const w = workflow({ built: s.built, analyzed: s.analyzed, hasDesign: !!s.design, ngCount: 0, preview: s.preview, genChanged: s.genChanged, job: null, lastFail: null })
  if (w.reason !== 'gen' && w.reason !== 'edited') return null
  return <div className="stale-banner" role="status">⚠ {t(w.reason === 'gen' ? 'wf_stale_gen' : 'wf_stale_edited')}</div>
}
