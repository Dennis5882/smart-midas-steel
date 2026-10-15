/* 해석 실행 · 결과 회수 */
import { t } from '../i18n'
import { mapi } from '../mapi/client'
import { S, notify, type ReactionSum } from '../state/store'
import { addMsg, log, tab } from '../state/ui'
import { autoSave } from './save'

/* doc/anal 은 거부 시 HTTP 200 + message 로 회신(에러 필드 아님) → 메시지 직접 점검 */
const NOT_ALLOWED = /not allowed|not permitted|허용되지|許可/i

export async function runAnalysis(): Promise<void> {
  if (S.busy) { addMsg('bot', t('busy')); return }
  if (!S.built) { addMsg('bot', t('no_model')); return }
  S.busy = true
  notify()
  addMsg('bot', t('anal_start'))
  try {
    await analyzeCore()
    addMsg('bot', t('anal_done'))
    tab('resP')
  } catch (e) {
    addMsg('bot', t('anal_fail', e instanceof Error ? e.message : String(e)))
  } finally {
    S.busy = false
    notify()
  }
}

/** 해석 본체 (busy·메시지 없음) — 단면 최적화 반복에서도 사용 */
export async function analyzeCore(): Promise<void> {
  await autoSave('model') // doc/new 직후 무제 문서는 해석이 거부되고 확인 창이 뜬다 → 먼저 저장
  const res = await mapi<{ message?: string }>('POST', '/doc/anal', {})
  if (NOT_ALLOWED.test(String(res?.message ?? ''))) throw new Error(String(res?.message))
  S.analyzed = true
  log(t('log_anal'), 'ok')
  await fetchReactions()
}

/** 하중 케이스별 반력 합계 — post/table REACTIONG 의 'SUMMATION OF REACTION FORCES PRINTOUT' */
export async function fetchReactions(): Promise<void> {
  if (!S.built) return
  const base = S.built.model.nodes.find((n) => n.z === 0)
  const r = await mapi<any>('POST', '/post/TABLE', {
    Argument: {
      TABLE_NAME: 'Reaction', TABLE_TYPE: 'REACTIONG',
      UNIT: { FORCE: 'kN', DIST: 'm' }, STYLES: { FORMAT: 'Fixed', PLACE: 3 },
      COMPONENTS: ['Node', 'Load', 'FX', 'FY', 'FZ'],
      NODE_ELEMS: { KEYS: base ? [base.id] : [] },
      LOAD_CASE_NAMES: S.built.cases.map((c) => `${c}(ST)`),
    },
  }, 'Reaction')
  const sub = r?.Reaction?.SUB_TABLES?.[0]?.['SUMMATION OF REACTION FORCES PRINTOUT']?.DATA as string[][] | undefined
  S.reactions = (sub ?? []).map(([lc, fx, fy, fz]): ReactionSum => ({ lc, fx: +fx, fy: +fy, fz: +fz }))
  notify()
}
