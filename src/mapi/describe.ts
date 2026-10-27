/* MAPI 호출 → 사람이 읽는 설명 (순수) — 진행 막대에 API 코드 옆에 붙인다 ('POST /post/TABLE · 부재력 읽는 중 — 요소 410 × 케이스 21').
   본문(TABLE_TYPE·KEYS·LOAD_CASE_NAMES·Assign 개수)에서 만들고, 문구는 그릴 때 현재 언어로(닫힌 함수). 모르는 경로는 null — API 코드만 보인다. */
import { t } from '../i18n'

type Body = Record<string, any> | undefined

export function describeCall(method: string, ep: string, body: Body): (() => string) | null {
  const p = ep.replace(/\/+$/, '').toLowerCase()
  if (p === '/doc/saveas') return () => t('ch_save')
  if (p === '/doc/open') return () => t('ch_open')
  if (p === '/doc/new') return () => t('ch_new')
  if (p === '/doc/anal') return () => t('ch_anal')
  if (p.startsWith('/view/')) return () => t('ch_view')
  if (p === '/post/table') {
    const a = body?.Argument ?? {}
    const type = String(a.TABLE_TYPE ?? ''), keys = Array.isArray(a.NODE_ELEMS?.KEYS) ? a.NODE_ELEMS.KEYS.length : 0
    const loads: string[] = Array.isArray(a.LOAD_CASE_NAMES) ? a.LOAD_CASE_NAMES : []
    /* 조합(CB)이 하나라도 있으면 조합, 아니면 케이스 */
    const combos = loads.some((l) => /\(CB\)$/.test(String(l)))
    return () => t('ch_table', t('ch_tbl', type), keys, loads.length, combos)
  }
  const db = p.startsWith('/db/') ? ep.replace(/\/+$/, '').slice(4).toUpperCase() : null
  if (!db) return null
  if (method === 'PUT') { const n = Object.keys(body?.Assign ?? {}).length; return () => t('ch_put', t('ch_db', db), n) }
  if (method === 'GET') return () => t('ch_get', t('ch_db', db))
  /* DELETE /db/<표>/<id> — 한 번호만 (용도는 호출의 note 에)*/
  if (method === 'DELETE' && db.includes('/')) { const [name, id] = db.split('/'); return () => t('ch_del', t('ch_db', name), id) }
  return null
}
