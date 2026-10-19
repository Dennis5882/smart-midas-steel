/* 산출물 화면 — 簽證 심사 대응표의 부분·생략 항목 사유 편집 (TW). 빈칸이면 기본 사유 */
import { t } from '../i18n'
import { S, notify, useStore } from '../state/store'
import { currentReview } from '../state/review'

export function ReviewEditor() {
  const s = useStore(), items = currentReview().filter((i) => i.status !== 'included')
  if (!items.length) return null
  return <details className="mw-advanced review-editor">
    <summary>{t('rv_edit')}<span>{items.length}</span></summary>
    <p className="mw-note">{t('rv_edit_note')}</p>
    <div className="pe-grid">{items.map((i) => <div className="pe-f pe-full" key={i.key}>
      <label htmlFor={`rv-${i.key}`}>{t(`rv_item_${i.key}`)} · {t(`rv_status_${i.status}`)}</label>
      <input id={`rv-${i.key}`} value={s.reviewReasons[i.key] ?? ''} placeholder={i.reason ? t(`rv_reason_${i.reason}`) : ''}
        onChange={(e) => { S.reviewReasons = { ...S.reviewReasons, [i.key]: e.target.value }; notify() }} />
    </div>)}</div>
  </details>
}
