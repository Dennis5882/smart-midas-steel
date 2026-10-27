/* 설계기준 선택 — 위저드 위쪽 띠(시작 화면·편집기)와 자유골조 편집기 공통. 바꾸면 session.setCode(입력이 있으면 확인 후 형상 유지·기준 기본값으로 새 편집기).
   간체는 CN 만 — 다른 기준으로 작업 중이면 빈 값 + 안내(project_code_existing). */
import { setCode } from '../agent/session'
import { CODE_IDS, PROFILES, type CodeId } from '../codes'
import { t, useLang } from '../i18n'
import { useStore } from '../state/store'

export function CodeSelect({ className = 'mw-code-select' }: { className?: string }) {
  const s = useStore()
  const lang = useLang()
  const restricted = lang === 'zh-CN' && s.code !== 'CN'
  const codes = lang === 'zh-CN' ? (['CN'] as const) : CODE_IDS
  return <select className={className} aria-label={t('code_label')} title={t('code_label')} value={restricted ? '' : s.code} disabled={s.busy || !!s.confirm}
    onChange={(e) => void setCode(e.target.value as CodeId)}>
    {restricted && <option value="" disabled>{t('project_code_existing')}</option>}
    {codes.map((id) => <option key={id} value={id}>{t(PROFILES[id].selectLabelKey ?? PROFILES[id].labelKey)}</option>)}
  </select>
}
