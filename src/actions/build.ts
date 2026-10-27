/* 스펙 → MIDAS Gen 전송 (새 문서에서 시작).
   순서: 자동저장 → doc/new → 단위 → 재료 → 단면 → 절점 → 요소 → 단부해제 → 지지조건 → 하중케이스 → 자중 → 보하중 → 절점하중 → 하중조합 → 설계 코드
   → 개수 확인(GET, 보낸 개수와 다르면 실패). */
import { profileOf } from '../codes'
import { buildGenPayloads } from '../domain/gen'
import { buildLoadPayloads, selfWeightOnly } from '../domain/loads'
import { GEN_FIXED_DBS, genLoadInfo, summarizeGenLoads } from '../domain/genLoads'
import { SectionUpdateError } from '../domain/genSections'
import { buildPortal } from '../domain/portal'
import type { FactorySpec } from '../domain/types'
import { checkScope } from '../domain/scope'
import { dbDifferences, diffText, isRecord } from '../domain/genSync'
import { sectionSourceDifferences } from '../domain/genSectionSync'
import { scopeMsg } from '../components/ScopeBox'
import { t, lt } from '../i18n'
import { mapi, tableOf } from '../mapi/client'
import { autoSave, autoSavePath } from './save'
import { confirmAction, confirmChoice } from '../components/ConfirmDialog'
import { beginJob, Cancelled, endJob, failMsg, stage } from './job'
import { S, clearResults, notify, type Built } from '../state/store'
import { addMsg, draw3D, escapeHtml, log, tab } from '../state/ui'

/** Gen 으로 보낼 내용은 생성 확인 창에서 고른다 — 정상 모델링 / [모델 + 자중만](형상·재료·단면·지점·단부 해제 + 자중 D, 엔지니어가 하중을 직접 넣는 용도).
    opts.modelOnly = 창의 처음 선택값(직전 선택). 화면 없는 실행은 이 값으로 진행 */
export async function buildFactory(spec: FactorySpec, opts: { modelOnly?: boolean } = {}): Promise<void> {
  if (S.busy) { addMsg('bot', lt('busy')); return }
  if (!S.mapiKey.trim()) { addMsg('bot', lt('need_key')); return }
  const scope = checkScope(spec)
  if (scope.blocked) { addMsg('bot', `${t('sc_blocked')}<br>${scope.issues.filter((i) => i.level === 'block').map((i) => `⛔ ${scopeMsg(i)}`).join('<br>')}`); return }
  /* Gen 문서 교체 확인 + 보낼 내용 선택 (현지 요청 2026-10-26: 최종 단계 화면의 선택은 눈에 잘 안 띔 → 생성할 때마다 창에서 고름).
     열린 문서는 자동 백업, 생성 후 [이전 모델로 복원] 가능 */
  const picked = await confirmChoice({ title: t('cfm_build_title'), body: t('cfm_build_body', escapeHtml(S.saveDir || 'C:/temp')), ok: t('cfm_build_ok'),
    choice: { legend: t('mw_gen_content'), value: opts.modelOnly ? 'model' : 'full', options: [
      { value: 'full', label: t('gc_full'), desc: t('gc_full_d') }, { value: 'model', label: t('gc_model'), desc: t('gc_model_d') }] } })
  if (!picked) return
  const modelOnly = picked === 'model'
  /* 선택을 편집기에 기억 — 다음 생성 창의 처음 값, 모델 탭 미리보기 안내 */
  if (S.activePlan) S.activePlan = { ...S.activePlan, modelOnly }
  /* 하중 페이로드(자중 케이스 포함)를 작업 시작·편집기 잠금(buildEpoch) 전에 확인 — Gen 을 건드리지 않은 실패로 편집기가 잠기지 않게 */
  try {
    const l = buildLoadPayloads(spec, buildPortal(spec))
    if (modelOnly) selfWeightOnly(l)
  } catch (e) { addMsg('bot', failMsg(e, (m) => t('build_fail', m))); notify(); return }
  if (!beginJob('build')) return
  S.buildEpoch++ // 이전 카드 버튼 잠금
  notify()
  addMsg('bot', lt('build_start'))
  tab('logP')
  try {
    /* 복원 지점은 doc/new 가 사용자 문서를 지운 순간 기록 — 이후 전송 실패·취소에도 실패 카드에서 복원 가능 */
    const model = await sendModel(spec, (backup) => { S.restorePoint = backup; notify() }, { modelOnly })
    const b = S.built!
    addMsg('bot', modelOnly ? lt('build_done_model_only', model.nodes.length, model.elements.length) : lt('build_done', model.nodes.length, model.elements.length, b.cases.length, b.combos))
    /* 모델 + 자중만은 해석·검토가 막히므로 산출물(도면·물량·계산서)로 */
    S.task = modelOnly ? 'outputs' : 'analysis'
    /* 생성 직후 3D 탭에서 ISO 전체 보기 — 미리보기에서 돌리거나 다른 시점이었어도 다시 맞춘다 (Gen 화면도 위에서 ISO) */
    S.cam = 'iso'; S.camReset++
    draw3D()
    tab('viewP')
  } catch (e) {
    addMsg('bot', failMsg(e, (m) => t('build_fail', m)))
  } finally {
    endJob()
  }
}

/** [이전 모델로 복원] — 마지막 [공장 생성] 직전 백업을 Gen 에서 다시 연다 (현재 문서는 sms_model_* 로 먼저 저장). 앱의 모델·결과는 비운다 */
export async function restoreBackup(): Promise<void> {
  const path = S.restorePoint
  if (!path || S.busy) return
  if (!await confirmAction({ title: t('cfm_restore_title'), body: t('cfm_restore_body', escapeHtml(path)), ok: t('cfm_restore_ok'), danger: true })) return
  if (!beginJob('restore')) return
  try {
    stage('st_restore', 2)
    await autoSave('model')
    const res = await mapi<{ message?: string }>('POST', '/doc/open', { Argument: path }, path)
    if (res?.message !== 'MIDAS GEN NX command complete') throw new Error(String(res?.message ?? t('gen_bad_response')))
    clearBuilt()
    S.restorePoint = null
    S.buildEpoch++
    draw3D()
    addMsg('bot', lt('restore_done', escapeHtml(path)))
  } catch (e) {
    addMsg('bot', failMsg(e, (m) => t('restore_fail', m)))
  } finally {
    endJob()
  }
}

/** 전송 본체 (busy·메시지 없음) — 단면 최적화 반복에서도 사용. 성공하면 S.built 갱신, 이전 결과 초기화.
    onReplaced: doc/new 직후 백업 경로 — [공장 생성]만 복원 지점으로 쓴다(최적화 반복의 백업은 앱이 만든 모델) */
export async function sendModel(spec: FactorySpec, onReplaced?: (backup: string) => void, opts: { modelOnly?: boolean } = {}) {
  const model = buildPortal(spec)
  const p = buildGenPayloads(spec, model)
  const l = buildLoadPayloads(spec, model)
  /* 모델 + 자중만: 자중 케이스와 BODF 만 — 마감 하중(BMLD)·절점 하중·조합 표는 보내지도 확인하지도 않는다.
     정상 모델링은 빈 표도 예전처럼 PUT·확인한다 */
  const loads = opts.modelOnly ? selfWeightOnly(l) : { STLD: l.STLD, BODF: l.BODF, BMLD: l.BMLD, CNLD: l.CNLD, 'LCOM-GEN': l['LCOM-GEN'] }
  const steps = Object.entries({ UNIT: p.UNIT, MATL: p.MATL, SECT: p.SECT, NODE: p.NODE, ELEM: p.ELEM, FRLS: p.FRLS, CONS: p.CONS, ...loads }) as [string, Record<string, unknown>][]
  const designCode = profileOf(spec.code).gen.designCode
  stage('st_send', 2 + steps.length + (designCode ? 1 : 0))
  /* 열린 문서를 먼저 임시 저장 → doc/new 가 "저장할까요?" 창을 띄우지 않게 (사용자 원본 파일은 건드리지 않음) */
  const backup = await autoSave('backup')
  /* 전체 문서를 doc/new 로 초기화 — 항목별 DELETE 의 경고·잔여 데이터 방지 (story 와 같은 방식) */
  await mapi('POST', '/doc/new', {})
  onReplaced?.(backup)
  /* 여기부터 Gen 문서는 이전 모델이 아니다 — 중간 실패·취소 때 이전 결과로 해석·검토하지 않게 먼저 비운다 */
  clearBuilt()
  for (const [name, assign] of steps) await mapi('PUT', name, { Assign: assign }, String(Object.keys(assign).length))
  if (designCode) await mapi('PUT', 'DSTL', { Assign: { 1: { DGNCODE: designCode } } })
  await verifyCounts(Object.fromEntries(steps))
  await checkSectionSource(spec, p.SECT)
  /* Gen 화면을 ISO 전체 보기로 (story 와 같은 각도, H 30·V 15). view/ANGLE 은 각도만 바꾸고 확대는 그대로라
     doc/new 직후 원점 근처가 크게 확대된 채 남는다. 맞춤(fit) 전용 API 는 없고, view/CAPTURE 의 ZOOM_LEVEL 100(Zoom Fit)이
     캡처 뒤에도 화면에 남는다 — 라이브 2026-10-19 확인 (view/ACTIVE All·doc/open 재열기는 효과 없음). 작은 PNG 하나가 저장 폴더에 남는다.
     화면 조작이라 실패해도 모델 생성은 성공으로 둔다 (취소는 그대로 전달) */
  try {
    await mapi('POST', '/view/ANGLE', { Argument: { HORIZONTAL: 30, VERTICAL: 15 } }, 'ISO')
    await mapi('POST', '/view/CAPTURE', { Argument: { EXPORT_PATH: autoSavePath('view').replace(/\.mgbx$/, '.png'), WIDTH: 400, HEIGHT: 300, ZOOM_LEVEL: 100 } }, 'zoom fit')
  } catch (e) { if (e instanceof Cancelled) throw e }

  const cases = Object.values(loads.STLD).map((c) => (c as { NAME: string }).NAME)
  const comboNames = opts.modelOnly ? [] : Object.values(l['LCOM-GEN']).map((c) => (c as { NAME: string }).NAME)
  const combos = comboNames.length
  const sent: Record<string, Record<string, unknown>> = Object.fromEntries(steps)
  if (designCode) sent.DSTL = { 1: { DGNCODE: designCode } }
  S.built = { spec, model, info: l.info, cases, combos, comboNames, sent, ...(opts.modelOnly ? { modelOnly: true } : {}) }
  S.lastSpec = spec
  S.draftSpec = spec
  S.draftInvalid = false
  S.modelRevision++
  log(t('log_built'), 'ok')
  return model
}

/** Gen 단면 성질(SECTIONALL A/I/J)이 앱 기준값과 같은지 — 다르면 완료 차단 */
async function checkSectionSource(spec: FactorySpec, sect: Record<string, unknown>): Promise<void> {
  const sectionTable = await mapi<any>('POST', '/post/TABLE', { Argument: {
    TABLE_NAME: 'SectionSource', TABLE_TYPE: 'SECTIONALL', UNIT: { FORCE:'KN', DIST:'MM', HEAT:'KJ', TEMP:'C' },
  } }, 'Gen section source')
  const sourceDifferences = sectionSourceDifferences(spec.code, sect, tableOf(sectionTable))
  if (sourceDifferences.length) throw new Error(t('section_source_mismatch', sourceDifferences.slice(0,4).join(', ')))
}

/** 단면이 바뀐 스펙을 Gen 에 반영 (최적화·NG 보완 공통) — 형상이 같으면 문서를 새로 만들지 않고 그 자리에서 단면·바뀐 하중 표만 고친다(updateSections).
    엔지니어 하중(F2) 모델은 항상 그 방식(형상이 바뀌면 거부), 앱 하중 모델은 그 자리에서 고칠 수 없을 때만 모델 재생성(sendModel) */
export async function resendModel(spec: FactorySpec, onReplaced?: (backup: string) => void) {
  const b = S.built
  if (!b?.sent || b.modelOnly && !b.genLoads) return sendModel(spec, onReplaced)
  /* 계획은 한 번만 계산해 넘긴다 (모델·하중 페이로드와 큰 하중 표 비교가 회차마다 두 번 돌지 않게) */
  const plan = inPlacePlan(b, spec)
  if (b.genLoads || plan?.ok) return updateSections(spec, onReplaced, plan)
  return sendModel(spec, onReplaced)
}

const same = (x: unknown, y: unknown) => JSON.stringify(x) === JSON.stringify(y)
const APP_LOAD_DBS = ['STLD', 'BODF', 'BMLD', 'CNLD', 'LCOM-GEN'] as const

/** 그 자리에서 고칠 내용 — 형상 표(GEN_FIXED_DBS)가 보낸 것과 같아야 한다. 앱 하중 모델은 새 단면으로 다시 계산한 하중 표 중 값이 바뀐 것도 PUT
    (지진력 = 무게 기반 등). PUT 은 항목 번호별로 덮어쓰므로 번호 집합이 다르면(없어진 항목이 Gen 에 남음) 고칠 수 없다 → null(엔지니어 하중 모델은 changed 로 거부 사유) */
function inPlacePlan(b: Built, spec: FactorySpec) {
  if (!b.sent) return null
  const model = buildPortal(spec)
  const p = buildGenPayloads(spec, model)
  const designCode = profileOf(spec.code).gen.designCode
  const want: Record<string, unknown> = { ...p, ...(designCode ? { DSTL: { 1: { DGNCODE: designCode } } } : {}) }
  const changed = GEN_FIXED_DBS.filter((db) => !same(want[db], b.sent![db]))
  if (model.elements.length !== b.model.elements.length || changed.length) return { ok: false as const, changed }
  if (b.genLoads) return { ok: true as const, model, p, loads: {} as Record<string, Record<string, unknown>>, l: buildLoadPayloads(spec, model) }
  const l = buildLoadPayloads(spec, model)
  const loads: Record<string, Record<string, unknown>> = {}
  for (const db of APP_LOAD_DBS) {
    const was = b.sent[db] ?? {}
    if (same(l[db], was)) continue
    if (!same(Object.keys(l[db]).sort(), Object.keys(was).sort())) return null
    loads[db] = l[db]
  }
  return { ok: true as const, model, p, loads, l }
}

/** 같은 단면 정의에서 뒴 효과만 끔 — 그 자리 갱신의 중간 단계 (updateSections) */
const withoutWarping = (s: unknown) => {
  const x = s as { SECT_BEFORE: Record<string, unknown> }
  return { ...x, SECT_BEFORE: { ...x.SECT_BEFORE, USE_WARPING_EFFECT: false } }
}

/** 문서를 새로 만들지 않고 단면 바꾸기 — SECT·ELEM(+ 앱 하중 모델은 값이 바뀐 하중 표)만 PUT. 요소·절점 번호가 그대로라 나머지는 유지되고
    (엔지니어 하중 모델은 Gen 의 엔지니어 하중·조합), 자중(BODF)은 Gen 이 새 단면으로 다시 계산한다. 쓰지 않게 된 앱 단면 번호는 지운다
    (엔지니어가 Gen 에서 만든 단면은 남김 — 동일성 기준은 다시 읽은 SECT). */
export async function updateSections(spec: FactorySpec, onBackup?: (backup: string) => void, planned?: ReturnType<typeof inPlacePlan>) {
  const b = S.built
  if (!b?.sent) throw new SectionUpdateError([])
  const plan = planned === undefined ? inPlacePlan(b, spec) : planned
  if (!plan?.ok) throw new SectionUpdateError(plan?.changed ?? [])
  const { model, p, loads, l } = plan
  /* 쓰지 않게 될 앱 단면 번호 — 이전 스펙으로 앱이 만든 번호·이름 그대로인데 새 단면 표에 없는 것 (단면 수가 줄거나 RC 받침 번호가 당겨질 때) */
  const nameOf = (x: unknown) => (x as { SECT_NAME?: string } | undefined)?.SECT_NAME
  const prevApp = buildGenPayloads(b.spec, b.model).SECT
  const stale = Object.keys(prevApp).filter((id) => !(id in p.SECT) && nameOf(b.sent!.SECT?.[id]) === nameOf(prevApp[id]))
  stage('st_sections', 5 + Object.keys(loads).length + (stale.length ? 1 + stale.length : 0))
  const backup = await autoSave('backup')
  onBackup?.(backup)
  /* 여기부터 Gen 단면은 이전 모델이 아니다 — 중간 실패·취소 때 이전 결과가 지금 모델의 결과로 남지 않게 먼저 비운다.
     S.built 는 새 객체(최적화 실패 처리가 이전 결과를 되살리지 않게), 동일성 기준은 그대로 — 다음 해석 직전 검사가 차이를 잡고 [Gen 하중 불러오기]로 다시 맞춘다 */
  S.built = { ...b }
  clearResults()
  notify()
  /* 단면 번호는 단면 이름이 처음 나온 순서라 단면이 바뀌면 번호가 밀린다 — 아직 옛 ELEM 의 TRUSS 요소가 쓰는 번호에 뒴 효과(7번째 자유도) 단면을
     먼저 넣으면 Gen 이 거부한다(CN 라이브 2026-10-27 'Section property considering 7th DOF … only to the beam elements').
     그 번호만 뒴 효과를 끈 채 넣고 → ELEM → 원래 값으로 다시 SECT */
  const oldTruss = new Set(Object.values(b.sent.ELEM ?? {}).filter((e) => (e as { TYPE?: string }).TYPE === 'TRUSS').map((e) => String((e as { SECT?: number }).SECT)))
  const clash = Object.keys(p.SECT).filter((id) => oldTruss.has(id) && (p.SECT[id] as { SECT_BEFORE?: { USE_WARPING_EFFECT?: boolean } }).SECT_BEFORE?.USE_WARPING_EFFECT)
  const safe = clash.length ? Object.fromEntries(Object.entries(p.SECT).map(([id, s]) => [id, clash.includes(id) ? withoutWarping(s) : s])) : p.SECT
  await mapi('PUT', 'SECT', { Assign: safe }, String(Object.keys(p.SECT).length))
  await mapi('PUT', 'ELEM', { Assign: p.ELEM }, String(Object.keys(p.ELEM).length))
  if (clash.length) await mapi('PUT', 'SECT', { Assign: Object.fromEntries(clash.map((id) => [id, p.SECT[id]])) }, String(clash.length))
  for (const [db, assign] of Object.entries(loads)) await mapi('PUT', db, { Assign: assign }, String(Object.keys(assign).length))
  const read = async (db: string) => {
    const got = (await mapi<Record<string, unknown>>('GET', db, undefined, 'verify'))?.[db]
    if (!isRecord(got)) throw new Error(t('verify_fail', `${db}: ${t('gen_bad_response')}`))
    return got
  }
  /* Gen 은 부재가 쓰는 단면도 경고 없이 지운다(부재는 없는 번호를 가리킨 채 남음, 라이브 2026-10-27) — Gen ELEM 을 다시 읽어 아무 부재도 쓰지 않는 번호만.
     DELETE /db/SECT/<id> 는 그 번호 하나 (번호 없는 /db/SECT DELETE 는 표 전체를 비운다) */
  if (stale.length) {
    const used = new Set(Object.values(await read('ELEM')).map((e) => String((e as { SECT?: number }).SECT)))
    for (const id of stale.filter((x) => !used.has(x))) await mapi('DELETE', `/db/SECT/${id}`, undefined, 'unused')
  }
  /* 확인 — 보낸 표가 그대로 들어갔는지 (SECT 는 엔지니어가 만든 다른 번호를 허용) */
  stage('st_verify', 3 + Object.keys(loads).length)
  const gotSect = await read('SECT')
  const bad = [...dbDifferences('SECT', p.SECT, gotSect, 3).filter((d) => d.added === undefined || d.removed), ...dbDifferences('ELEM', p.ELEM, await read('ELEM'), 3)]
  for (const [db, assign] of Object.entries(loads)) bad.push(...dbDifferences(db, assign, await read(db), 3))
  if (bad.length) throw new Error(t('verify_fail', bad.map(diffText).join(', ')))
  await checkSectionSource(spec, p.SECT)
  const sent = { ...b.sent, SECT: gotSect, ELEM: p.ELEM, ...loads }
  if (b.genLoads) {
    /* 요약은 읽은 하중 표 전부(합산 못 하는 표 포함)로 다시 — 자중 추정만 새 단면, 조합 용도는 확정한 것 */
    const kinds = new Map(b.genLoads.combos.map((c) => [c.name, c.kind]))
    const fresh = summarizeGenLoads(spec, model, b.genRaw ?? b.sent)
    const summary = { ...fresh, combos: fresh.combos.map((c) => ({ ...c, kind: kinds.get(c.name) ?? c.kind })) }
    S.built = { ...b, spec, model, info: genLoadInfo(l.info, summary), genLoads: summary, sent }
  } else {
    const names = (tbl: Record<string, unknown>) => Object.values(tbl).map((c) => (c as { NAME: string }).NAME)
    S.built = { ...b, spec, model, info: l.info, cases: names(l.STLD), comboNames: names(l['LCOM-GEN']), combos: Object.keys(l['LCOM-GEN']).length, sent }
  }
  clearResults()
  S.lastSpec = spec
  S.draftSpec = spec
  S.draftInvalid = false
  S.modelRevision++
  log(t('log_sections_updated', Object.keys(p.SECT).length, Object.keys(loads).length), 'ok')
  notify()
  return model
}

function clearBuilt(): void {
  S.built = null
  clearResults()
  notify()
}

/* 응답 형식을 모르면 실패. 개수·대상 ID 와 보낸 필드 값 전부를 Gen 동일성 검사(domain/genSync)와 같은 규칙으로 비교 —
   하중은 항목 ID·케이스·방향·위치·값까지. Gen 이 붙이는 기본 필드·배열 순서 변경·ELEM NODE 0 채움은 허용. */
const VERIFY = ['MATL', 'SECT', 'NODE', 'ELEM', 'FRLS', 'CONS', 'STLD', 'LCOM-GEN', 'BODF', 'BMLD', 'CNLD'] as const

async function verifyCounts(sent: Record<string, Record<string, unknown>>): Promise<void> {
  /* 보내지 않은 표(모델 + 자중만의 하중·조합)는 읽지 않는다 — 새 문서에 없는 표를 Gen 이 오류로 답할 수 있음 */
  const names = VERIFY.filter((name) => name in sent)
  stage('st_verify', names.length + 1) // DB readback plus the Gen property source table.
  const bad: string[] = []
  for (const name of names) {
    const want = Object.keys(sent[name]).length
    const r = await mapi<Record<string, unknown>>('GET', name, undefined, String(want))
    const got = r?.[name]
    if (!isRecord(got)) throw new Error(t('verify_fail', `${name}: ${t('gen_bad_response')}`))
    for (const d of dbDifferences(name, sent[name] ?? {}, got, 3)) bad.push(diffText(d))
  }
  if (bad.length) throw new Error(t('verify_fail', bad.join(', ')))
  log(t('log_verify_ok', names.length), 'ok')
}
