/* Gen 에서 엔지니어가 넣은 하중 읽어 오기 (F2 1단계) — docs/reference/gen-readback-scope.md.
   [Gen 하중 불러오기]: 형상 DB 동일성 확인(하중은 엔지니어가 바꾼 것을 읽으므로 제외) → 하중 표 GET → 확인 화면(S.genRead).
   [이 하중으로 확정]: S.built 의 케이스·조합·하중 정보를 Gen 것으로 바꾼다 — 이후 해석·설계 검토·산출물은 같은 흐름.
   1단계 범위: TW·추가 구조 없음. 형상이 바뀌었으면 막는다(GenChangedError). */
import { SYNC_DBS } from '../domain/genSync'
import { GEN_LOAD_DBS, GEN_OPAQUE_DBS, blockingComboIssues, genLoadInfo, summarizeGenLoads } from '../domain/genLoads'
import { lt, t } from '../i18n'
import { mapi } from '../mapi/client'
import { S, notify, type Built } from '../state/store'
import { addMsg, log, tab } from '../state/ui'
import { assertGenSync } from './genSync'
import { beginJob, Cancelled, endJob, failMsg, stage } from './job'

const LOAD_SET = new Set<string>(GEN_LOAD_DBS)
/** 형상 DB — 동일성 확인 대상 (하중 표 제외) */
export const GEOMETRY_DBS = SYNC_DBS.filter((db) => !LOAD_SET.has(db))

/** 읽어 오기를 할 수 없는 이유 (i18n 키) — 없으면 null */
export function readbackUnavailable(b: Built | null): 'no_model' | 'rb_code' | 'rb_additions' | null {
  if (!b) return 'no_model'
  if (b.spec.code !== 'TW') return 'rb_code'
  if (b.model.additions || b.info.additions) return 'rb_additions'
  return null
}

export async function readGenLoads(): Promise<void> {
  if (S.busy) { addMsg('bot', lt('busy')); return }
  const why = readbackUnavailable(S.built)
  if (why) { addMsg('bot', lt(why)); return }
  if (!S.mapiKey.trim()) { addMsg('bot', lt('need_key')); return }
  if (!beginJob('readback')) return
  const b = S.built!
  try {
    await assertGenSync(GEOMETRY_DBS) // 형상이 바뀌었으면 막음 — 차이 목록은 failMsg 가
    stage('st_read', GEN_LOAD_DBS.length + GEN_OPAQUE_DBS.length)
    /* 없는 표(엔지니어가 그 하중을 안 넣음)를 Gen 이 오류로 답해도 '없음' — 연결 문제는 앞의 형상 확인에서 이미 걸린다.
       합산하지 못하는 표(GEN_OPAQUE_DBS)는 있는지만 본다 */
    const raw: Record<string, Record<string, unknown>> = {}
    for (const db of [...GEN_LOAD_DBS, ...GEN_OPAQUE_DBS]) {
      try {
        const r = await mapi<Record<string, unknown>>('GET', db, undefined, 'read')
        const v = r?.[db]
        if (v && typeof v === 'object' && Object.keys(v).length) raw[db] = v as Record<string, unknown>
      } catch (e) { if (e instanceof Cancelled) throw e }
    }
    const summary = summarizeGenLoads(b.spec, b.model, raw)
    S.genRead = { summary, raw, built: b }
    log(t('log_rb_read', summary.cases.length, summary.combos.length), 'ok')
    addMsg('bot', lt('rb_done', summary.cases.length, summary.combos.length))
    S.task = 'analysis'
    notify()
  } catch (e) {
    addMsg('bot', failMsg(e, (m) => t('rb_fail', m)))
  } finally {
    endJob()
  }
}

/** 확정할 수 없는 이유 — 조합 이상·조합 없음·모델이 바뀜 */
export function acceptUnavailable(): 'rb_stale' | 'rb_combo_issue' | 'rb_no_combos' | null {
  const r = S.genRead
  if (!r || r.built !== S.built) return 'rb_stale'
  if (!r.summary.combos.length) return 'rb_no_combos'
  if (blockingComboIssues(r.summary).length) return 'rb_combo_issue'
  return null
}

/** 확인한 Gen 하중으로 확정 — 이전 해석·검토 결과는 비운다 (Gen 호출 없음 — 해석 직전 동일성 검사가 이 하중을 기준으로 다시 확인) */
export function acceptGenLoads(): void {
  const r = S.genRead
  if (!r || S.busy || acceptUnavailable()) return
  const b = r.built, s = r.summary
  const loads = Object.fromEntries(GEN_LOAD_DBS.filter((db) => Object.keys(r.raw[db] ?? {}).length).map((db) => [db, r.raw[db]]))
  const geometry = Object.fromEntries(Object.entries(b.sent ?? {}).filter(([db]) => !LOAD_SET.has(db)))
  S.built = {
    spec: b.spec, model: b.model, info: genLoadInfo(b.info, s),
    cases: s.cases.map((c) => c.name), comboNames: s.combos.map((c) => c.name), combos: s.combos.length,
    sent: { ...geometry, ...loads }, genLoads: s,
  }
  S.genRead = null
  S.genChanged = 0
  S.analyzed = false
  S.reactions = null; S.baseReactions = null; S.results = null; S.design = null; S.connections = null; S.opt = null
  S.repairPlan = null; S.repairComparison = null
  S.modelRevision++
  addMsg('bot', lt('rb_accepted', s.cases.length, s.combos.length))
  tab('logP')
  notify()
}

export function discardGenLoads(): void {
  S.genRead = null
  notify()
}
