/* Gen 에서 엔지니어가 넣은 하중 읽어 오기 (F2 1단계) — docs/reference/gen-readback-scope.md.
   [Gen 하중 불러오기]: 형상 DB 동일성 확인(하중은 엔지니어가 바꾼 것을 읽으므로 제외) → 하중 표 GET → 확인 화면(S.genRead).
   [이 하중으로 확정]: S.built 의 케이스·조합·하중 정보를 Gen 것으로 바꾼다 — 이후 해석·설계 검토·산출물은 같은 흐름.
   1단계 범위: TW·추가 구조 없음. 형상이 바뀌었으면 막는다(GenChangedError). */
import type { ComboKind } from '../codes'
import { reviewGenSections, SectionReviewError } from '../domain/genSections'
import { buildLoadPayloads } from '../domain/loads'
import { GEN_FIXED_DBS, GEN_LOAD_DBS, GEN_OPAQUE_DBS, LOAD_SET, blockingComboIssues, genLoadInfo, summarizeGenLoads } from '../domain/genLoads'
import { lt, t } from '../i18n'
import { mapi } from '../mapi/client'
import { S, clearResults, notify, type Built } from '../state/store'
import { addMsg, addPlanMsg, draw3D, log, tab } from '../state/ui'
import { assertGenSync } from './genSync'
import { confirmAction } from '../components/ConfirmDialog'
import { specChanged } from '../state/taskFlow'
import { beginJob, Cancelled, endJob, failMsg, stage } from './job'


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
  /* 이전에 읽은 확인 화면은 버린다 — 다시 읽기가 실패하면 옛 내용이 확정 가능한 채 남지 않게 */
  S.genRead = null
  try {
    await assertGenSync(GEN_FIXED_DBS) // 형상·재료·지점이 바뀌었으면 막음 — 차이 목록은 failMsg 가
    /* 단면: 엔지니어가 Gen 에서 바꿨으면 받아들일 수 있는지 (역할마다 한 단면·앱 목록·같은 정의) — 안 되면 이유와 함께 막음 */
    const SECT = (await mapi<Record<string, unknown>>('GET', 'SECT', undefined, 'read'))?.SECT
    const ELEM = (await mapi<Record<string, unknown>>('GET', 'ELEM', undefined, 'read'))?.ELEM
    const review = reviewGenSections(b.spec, b.model, SECT, ELEM)
    if (!review.ok) throw new SectionReviewError(review.reason, review.detail, review.role)
    const { spec, model } = review
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
    const summary = summarizeGenLoads(spec, model, raw)
    /* 읽은 SECT·ELEM 은 단면 변경이 없어도 확정 때 동일성 기준으로 — 해석 옵션·같은 이름의 새 단면 번호 등 받아들인 차이가 다음 동일성 검사에서 막히지 않게 */
    S.genRead = { summary, raw, built: b, kinds: Object.fromEntries(summary.combos.map((c) => [c.name, c.kind])), sectionOptions: review.options,
      SECT: SECT as Record<string, unknown>, ELEM: ELEM as Record<string, unknown>, ...(review.changes.length ? { sections: { spec, model, changes: review.changes } } : {}) }
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

/** 확정할 수 없는 이유 — 조합 이상·조합 없음·기본 조합 없음·모델이 바뀜 */
export function acceptUnavailable(): 'rb_stale' | 'rb_combo_issue' | 'rb_no_combos' | 'rb_no_basic' | null {
  const r = S.genRead
  if (!r || r.built !== S.built) return 'rb_stale'
  if (!r.summary.combos.length) return 'rb_no_combos'
  /* 부재 검토는 기본(강도) 조합만 쓴다(가새만 증폭 지진도) — 기본이 하나도 없으면 기둥·보 검토가 통째로 빠져 강도비 0·NG 0 처럼 보인다 */
  if (!r.summary.combos.some((c) => (r.kinds?.[c.name] ?? c.kind) === 'basic')) return 'rb_no_basic'
  if (blockingComboIssues(r.summary).length) return 'rb_combo_issue'
  return null
}

/** 확인한 Gen 하중으로 확정 — 이전 해석·검토 결과는 비운다 (Gen 호출 없음 — 해석 직전 동일성 검사가 이 하중을 기준으로 다시 확인) */
export async function acceptGenLoads(): Promise<void> {
  const r = S.genRead
  if (!r || S.busy || acceptUnavailable()) return
  /* Gen 단면을 받아들이면 편집기가 그 스펙으로 바뀐다 — 아직 Gen 에 보내지 않은 편집이 있으면 먼저 묻는다 */
  if (r.sections && specChanged(S.draftSpec, r.built.spec)) {
    if (!await confirmAction({ title: t('rb_accept'), body: t('rb_draft_lost'), ok: t('rb_accept'), danger: true })) return
    if (S.genRead !== r || S.busy || acceptUnavailable()) return
  }
  const b = r.built, sc = r.sections
  /* 요약의 조합 용도 = 확정한 것 (이후 단면 갱신·계산서도 이 값) */
  const s = { ...r.summary, combos: r.summary.combos.map((c) => ({ ...c, kind: r.kinds[c.name] ?? c.kind })) }
  const loads = Object.fromEntries(GEN_LOAD_DBS.filter((db) => Object.keys(r.raw[db] ?? {}).length).map((db) => [db, r.raw[db]]))
  const geometry = Object.fromEntries(Object.entries(b.sent ?? {}).filter(([db]) => !LOAD_SET.has(db)))
  /* Gen 에서 바꾼 단면을 받아들이면 앱 스펙·모델·하중 정보(앱 자동 하중 값은 새 단면 자중)도 새 단면으로, 동일성 기준 = 지금 Gen 의 SECT·ELEM */
  const spec = sc ? sc.spec : b.spec, model = sc ? sc.model : b.model
  const appInfo = sc ? buildLoadPayloads(spec, model).info : b.info
  S.built = {
    spec, model, info: genLoadInfo(appInfo, s),
    cases: s.cases.map((c) => c.name), comboNames: s.combos.map((c) => c.name), combos: s.combos.length,
    sent: { ...geometry, SECT: r.SECT, ELEM: r.ELEM, ...loads }, genLoads: s, genRaw: r.raw,
  }
  if (sc) {
    /* 편집기도 새 단면으로 — 이전 편집기가 남으면 입력 변경(specChanged)으로 결과가 '이전 결과'가 된다 (NG 보완 적용과 같은 방식) */
    const editor = S.activePlan
    S.lastSpec = spec; S.draftSpec = spec; S.draftInvalid = false
    S.buildEpoch++
    S.modelRevision++ // 새 편집기가 지금 모델 개정을 갖게 (아래에서 다시 올리지 않음)
    addPlanMsg(structuredClone(spec), editor?.mode ?? 'free', editor?.tpl)
    S.preview = null
    S.task = 'analysis'
    draw3D()
  }
  S.genRead = null
  clearResults()
  if (!sc) S.modelRevision++
  addMsg('bot', lt('rb_accepted', s.cases.length, s.combos.length))
  tab('logP')
  notify()
}

/** 확인 화면 — 조합 용도 변경 (2단계: 증폭 지진·중력·ASD 를 엔지니어가 지정) */
export function setComboKind(name: string, kind: ComboKind): void {
  if (!S.genRead) return
  S.genRead = { ...S.genRead, kinds: { ...S.genRead.kinds, [name]: kind } }
  notify()
}

export function discardGenLoads(): void {
  S.genRead = null
  notify()
}
