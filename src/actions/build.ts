/* 스펙 → MIDAS Gen 전송 (새 문서에서 시작).
   순서: 자동저장 → doc/new → 단위 → 재료 → 단면 → 절점 → 요소 → 단부해제 → 지지조건 → 하중케이스 → 자중 → 보하중 → 절점하중 → 하중조합 → 설계 코드
   → 개수 확인(GET, 보낸 개수와 다르면 실패). */
import { profileOf } from '../codes'
import { buildGenPayloads } from '../domain/gen'
import { buildLoadPayloads } from '../domain/loads'
import { buildPortal } from '../domain/portal'
import type { FactorySpec } from '../domain/types'
import { checkScope } from '../domain/scope'
import { scopeMsg } from '../components/ScopeBox'
import { t } from '../i18n'
import { mapi } from '../mapi/client'
import { autoSave } from './save'
import { beginJob, endJob, failMsg, stage } from './job'
import { S, notify } from '../state/store'
import { addMsg, draw3D, log, tab } from '../state/ui'

export async function buildFactory(spec: FactorySpec): Promise<void> {
  if (S.busy) { addMsg('bot', t('busy')); return }
  if (!S.mapiKey.trim()) { addMsg('bot', t('need_key')); return }
  const scope = checkScope(spec)
  if (scope.blocked) { addMsg('bot', `${t('sc_blocked')}<br>${scope.issues.filter((i) => i.level === 'block').map((i) => `⛔ ${scopeMsg(i)}`).join('<br>')}`); return }
  if (!beginJob('build')) return
  S.buildEpoch++ // 이전 카드 버튼 잠금
  notify()
  addMsg('bot', t('build_start'))
  tab('logP')
  try {
    const model = await sendModel(spec)
    const b = S.built!
    addMsg('bot', t('build_done', model.nodes.length, model.elements.length, b.cases.length, b.combos))
    draw3D()
    tab('modelP')
  } catch (e) {
    addMsg('bot', failMsg(e, (m) => t('build_fail', m)))
  } finally {
    endJob()
  }
}

/** 전송 본체 (busy·메시지 없음) — 단면 최적화 반복에서도 사용. 성공하면 S.built 갱신, 이전 결과 초기화 */
export async function sendModel(spec: FactorySpec) {
  const model = buildPortal(spec)
  const p = buildGenPayloads(spec, model)
  const l = buildLoadPayloads(spec, model)
  const steps: [string, Record<string, unknown>][] = [
    ['UNIT', p.UNIT], ['MATL', p.MATL], ['SECT', p.SECT], ['NODE', p.NODE], ['ELEM', p.ELEM], ['FRLS', p.FRLS], ['CONS', p.CONS],
    ['STLD', l.STLD], ['BODF', l.BODF], ['BMLD', l.BMLD], ['CNLD', l.CNLD], ['LCOM-GEN', l['LCOM-GEN']],
  ]
  const designCode = profileOf(spec.code).gen.designCode
  stage('st_send', 2 + steps.length + (designCode ? 1 : 0))
  /* 열린 문서를 먼저 임시 저장 → doc/new 가 "저장할까요?" 창을 띄우지 않게 (사용자 원본 파일은 건드리지 않음) */
  await autoSave('backup')
  /* 전체 문서를 doc/new 로 초기화 — 항목별 DELETE 의 경고·잔여 데이터 방지 (story 와 같은 방식) */
  await mapi('POST', '/doc/new', {})
  /* 여기부터 Gen 문서는 이전 모델이 아니다 — 중간 실패·취소 때 이전 결과로 해석·검토하지 않게 먼저 비운다 */
  clearBuilt()
  for (const [name, assign] of steps) await mapi('PUT', name, { Assign: assign }, String(Object.keys(assign).length))
  if (designCode) await mapi('PUT', 'DSTL', { Assign: { 1: { DGNCODE: designCode } } })
  await verifyCounts(Object.fromEntries(steps))

  const cases = Object.values(l.STLD).map((c) => (c as { NAME: string }).NAME)
  const comboNames = Object.values(l['LCOM-GEN']).map((c) => (c as { NAME: string }).NAME)
  const combos = comboNames.length
  S.built = { spec, model, info: l.info, cases, combos, comboNames }
  S.lastSpec = spec
  log(t('log_built'), 'ok')
  return model
}

function clearBuilt(): void {
  S.built = null
  S.analyzed = false
  S.reactions = null
  S.results = null
  S.design = null
  S.connections = null
  S.opt = null
  notify()
}

/* 전송 후 개수 확인 — Gen 이 일부를 조용히 버리면(오류 없이 개수 부족) 이후 해석이 틀린 모델로 진행되므로 막는다.
   응답에 해당 키가 없으면(형식이 다른 버전) 경고만 남기고 넘어간다. */
const VERIFY = ['MATL', 'SECT', 'NODE', 'ELEM', 'FRLS', 'CONS', 'STLD', 'LCOM-GEN'] as const

async function verifyCounts(sent: Record<string, Record<string, unknown>>): Promise<void> {
  stage('st_verify', VERIFY.length)
  const bad: string[] = []
  for (const name of VERIFY) {
    const want = Object.keys(sent[name] ?? {}).length
    if (!want) continue
    const r = await mapi<Record<string, unknown>>('GET', name, undefined, String(want))
    const got = r?.[name]
    if (!got || typeof got !== 'object') { log(t('log_verify_skip', name), 'warn'); continue }
    const n = Object.keys(got).length
    if (n !== want) bad.push(`${name} ${n}/${want}`)
  }
  if (bad.length) throw new Error(t('verify_fail', bad.join(', ')))
  log(t('log_verify_ok', VERIFY.length), 'ok')
}
