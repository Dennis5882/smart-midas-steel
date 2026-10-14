import { setCode } from '../agent/session'
import { CODE_IDS, PROFILES, type CodeId } from '../codes'
import { LANG_DEFS, normalizeLang, setLang, t, useLang } from '../i18n'
import { useStore } from '../state/store'

export function Header({ onOpenMapi }: { onOpenMapi(): void }) {
  const s = useStore()
  const lang = useLang()
  const connTxt = s.connected ? t('conn_linked') : s.connErr ? t('conn_failed') : t('conn_unlinked')

  return (
    <header>
      <div className="mark">STL</div>
      <h1>
        {t('app_name')}
        <small>{t('subtitle')}</small>
      </h1>
      <div className="spacer" />
      <div className="langsel">
        <select value={lang} onChange={(e) => { const l = normalizeLang(e.target.value); if (l) setLang(l) }} aria-label="Language">
          {LANG_DEFS.map((d) => <option key={d.code} value={d.code}>{d.label}</option>)}
        </select>
      </div>
      {/* 설계기준 — UI 언어와 독립. 이후 새로 만드는 모델에 적용 */}
      <div className="langsel" title={t('code_label')}>
        <select value={s.code} onChange={(e) => setCode(e.target.value as CodeId)} aria-label={t('code_label')}>
          {CODE_IDS.map((id) => <option key={id} value={id}>{t(PROFILES[id].labelKey)}</option>)}
        </select>
      </div>
      <div className={`pill${s.connected ? ' on' : ''}${s.connErr ? ' err' : ''}`} onClick={onOpenMapi}>
        <span className="dot" />
        <span>{connTxt}</span>
      </div>
      <div className="gear" onClick={onOpenMapi} title={t('settings')}>⚙</div>
    </header>
  )
}
