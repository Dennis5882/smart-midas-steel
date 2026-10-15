/* 설계 검토 실행 (M3) — 결과 회수(M2) → 대만 LRFD 부재·사용성 검토 */
import { runConnections } from '../domain/connections'
import { runDesign } from '../domain/design'
import { summarizeStatus } from '../domain/status'
import { checkScope } from '../domain/scope'
import { statusLine } from '../components/Status'
import { t, tc } from '../i18n'
import { S, notify } from '../state/store'
import { addMsg, log, tab } from '../state/ui'
import { fetchResults } from './results'

export async function runDesignCheck(): Promise<void> {
  if (S.busy) { addMsg('bot', t('busy')); return }
  if (!S.built) { addMsg('bot', t('no_model')); return }
  if (!S.analyzed) { addMsg('bot', t('need_anal')); return }
  S.busy = true
  notify()
  addMsg('bot', tc(S.built.spec.code, 'design_start'))
  try {
    const b = S.built
    S.results = await fetchResults(b)
    log(t('log_results'), 'ok')
    S.design = runDesign(b.spec, b.model, b.info, S.results)
    S.connections = runConnections(b.spec, b.model, b.info, S.results)
    const d = S.design
    log(t('log_design', d.members.length, d.ng), d.ng ? 'warn' : 'ok')
    S.ratioView = true
    addMsg('bot', t('design_done', d.members.length, d.maxRatio.toFixed(2), statusLine(summarizeStatus(d, S.connections, checkScope(S.built!.spec)))))
    tab('resP')
  } catch (e) {
    addMsg('bot', t('design_fail', e instanceof Error ? e.message : String(e)))
  } finally {
    S.busy = false
    notify()
  }
}
