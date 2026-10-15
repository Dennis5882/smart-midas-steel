/* 스펙 → MIDAS Gen 전송 (새 문서에서 시작).
   순서: 자동저장 → doc/new → 단위 → 재료 → 단면 → 절점 → 요소 → 단부해제 → 지지조건 → 하중케이스 → 자중 → 보하중 → 절점하중 → 하중조합 → 설계 코드. */
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
import { S, notify } from '../state/store'
import { addMsg, draw3D, log, tab } from '../state/ui'

export async function buildFactory(spec: FactorySpec): Promise<void> {
  if (S.busy) { addMsg('bot', t('busy')); return }
  if (!S.mapiKey.trim()) { addMsg('bot', t('need_key')); return }
  const scope = checkScope(spec)
  if (scope.blocked) { addMsg('bot', `${t('sc_blocked')}<br>${scope.issues.filter((i) => i.level === 'block').map((i) => `⛔ ${scopeMsg(i)}`).join('<br>')}`); return }
  S.busy = true
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
    addMsg('bot', t('build_fail', e instanceof Error ? e.message : String(e)))
  } finally {
    S.busy = false
    notify()
  }
}

/** 전송 본체 (busy·메시지 없음) — 단면 최적화 반복에서도 사용. 성공하면 S.built 갱신, 이전 결과 초기화 */
export async function sendModel(spec: FactorySpec) {
  const model = buildPortal(spec)
  const p = buildGenPayloads(spec, model)
  const l = buildLoadPayloads(spec, model)
  /* 열린 문서를 먼저 임시 저장 → doc/new 가 "저장할까요?" 창을 띄우지 않게 (사용자 원본 파일은 건드리지 않음) */
  await autoSave('backup')
  /* 전체 문서를 doc/new 로 초기화 — 항목별 DELETE 의 경고·잔여 데이터 방지 (story 와 같은 방식) */
  await mapi('POST', '/doc/new', {})
  const steps: [string, Record<string, unknown>][] = [
    ['UNIT', p.UNIT], ['MATL', p.MATL], ['SECT', p.SECT], ['NODE', p.NODE], ['ELEM', p.ELEM], ['FRLS', p.FRLS], ['CONS', p.CONS],
    ['STLD', l.STLD], ['BODF', l.BODF], ['BMLD', l.BMLD], ['CNLD', l.CNLD], ['LCOM-GEN', l['LCOM-GEN']],
  ]
  for (const [name, assign] of steps) await mapi('PUT', name, { Assign: assign }, String(Object.keys(assign).length))
  const designCode = profileOf(spec.code).gen.designCode
  if (designCode) await mapi('PUT', 'DSTL', { Assign: { 1: { DGNCODE: designCode } } })

  const cases = Object.values(l.STLD).map((c) => (c as { NAME: string }).NAME)
  const comboNames = Object.values(l['LCOM-GEN']).map((c) => (c as { NAME: string }).NAME)
  const combos = comboNames.length
  S.built = { spec, model, info: l.info, cases, combos, comboNames }
  S.lastSpec = spec
  S.analyzed = false
  S.reactions = null
  S.results = null
  S.design = null
  S.connections = null
  S.opt = null
  log(t('log_built'), 'ok')
  return model
}
