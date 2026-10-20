/* Regression for incomplete/corrupt analysis results, without Gen or a key.
   TW uses captured Gen results. CN uses a complete zero-response fixture to
   test validation only (not structural correctness). */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { decodeResults, FIXTURE } from './tw-golden'
import { resultTable } from './fake-gen'
import { buildPortal } from '../src/domain/portal'
import { buildLoadPayloads } from '../src/domain/loads'
import { CN_DEFAULT_SPEC, KR_DEFAULT_SPEC } from '../src/domain/types'
import { runDesign } from '../src/domain/design'
import { runConnections } from '../src/domain/connections'
import { ResultValidationError, serviceNodes } from '../src/domain/resultValidation'
import type { Results } from '../src/actions/results'
import type { Built } from '../src/state/store'

;(globalThis as any).document = { documentElement: { lang: 'ko', dataset: {} } }
const { fetchResults, reusableResults } = await import('../src/actions/results')
const { S } = await import('../src/state/store')
const { setConfirmHandler } = await import('../src/components/ConfirmDialog')
setConfirmHandler(() => true) // 화면 없음 — 모델 교체 확인 자동 승인
const { msgText } = await import('../src/state/ui')
const { runDesignCheck } = await import('../src/actions/design')
const { t } = await import('../src/i18n')
const { buildReport } = await import('../src/report/report')
const tw = JSON.parse(gunzipSync(readFileSync(FIXTURE)).toString())
let passed = 0, fault = ''
const tableCalls: string[] = []
const zero = () => ({ P: 0, Vy: 0, Vz: 0, My: 0, Mz: 0 })

function input(code: 'TW' | 'CN' | 'KR'): { built: Built; results: Results } {
  const spec = structuredClone(code === 'CN' ? CN_DEFAULT_SPEC : code === 'KR' ? KR_DEFAULT_SPEC : tw.spec), model = buildPortal(spec), loads = buildLoadPayloads(spec, model)
  const comboNames = Object.keys(loads.info.comboKind), cases = Object.values(loads.STLD).map((x: any) => x.NAME)
  const built = { spec, model, info: loads.info, comboNames, combos: comboNames.length, cases }
  if (code === 'TW') return { built, results: decodeResults(structuredClone(tw.results)) }
  const results: Results = { beam: new Map(), truss: new Map(), sway: new Map(), disp: new Map(), combos: comboNames }
  for (const e of model.elements) {
    if (e.role === 'brace') results.truss.set(e.id, new Map(comboNames.map((c) => [c, 0])))
    else results.beam.set(e.id, new Map(comboNames.map((c) => [c, Array.from({ length: 5 }, zero)])))
  }
  for (const c of comboNames) results.sway.set(c, { X: { sumPu: 0, drift: 0, sumH: 0 }, Y: { sumPu: 0, drift: 0, sumH: 0 } })
  for (const c of cases) results.disp.set(c, new Map(serviceNodes(spec, model).nodes.map((n) => [n.id, { dx: 0, dy: 0, dz: 0 }])))
  return { built, results }
}

for (const code of ['TW', 'CN', 'KR'] as const) {
  const cn = code === 'CN'
  let source = input(code)
  const design = () => runDesign(source.built.spec, source.built.model, source.built.info, source.results)
  assert.equal(design().members.length, source.built.model.elements.length); passed++
  const mutations: Record<string, (r: Results) => void> = {
    'missing beam': (r) => { r.beam.delete(r.beam.keys().next().value!) },
    'missing purlin with local-wind demands': (r) => { r.beam.delete(source.built.model.elements.find((e) => e.role === 'purlin')!.id) },
    'missing combo declaration': (r) => { r.combos.pop() },
    'missing beam combo': (r) => { const m = r.beam.values().next().value!; m.delete(m.keys().next().value!) },
    'missing station': (r) => { r.beam.values().next().value!.values().next().value!.pop() },
    'NaN force': (r) => { r.beam.values().next().value!.values().next().value![0].P = NaN },
    'infinite force': (r) => { r.beam.values().next().value!.values().next().value![0].My = Infinity },
    'missing brace': (r) => { r.truss.delete(r.truss.keys().next().value!) },
    'missing sway': (r) => { r.sway.clear() },
    'missing LR': (r) => { r.disp.delete('LR') },
    'missing wind node': (r) => { const c = source.built.info.wind.variants[0].parts[0].lc; r.disp.get(c)!.delete(serviceNodes(source.built.spec, source.built.model).eaves[0].id) },
    'NaN displacement': (r) => { r.disp.get('EX')!.values().next().value!.dx = NaN },
  }
  for (const [name, mutate] of Object.entries(mutations)) {
    source = input(code); mutate(source.results)
    assert.throws(design, ResultValidationError, `${code} ${name}`); passed++
  }
  source = input(code); source.results.truss.clear()
  assert.throws(() => runConnections(source.built.spec, source.built.model, source.built.info, source.results), ResultValidationError); passed++
  source = input(code); source.results.disp.delete(cn ? 'SN' : 'ETX')
  assert.throws(design, ResultValidationError); passed++

  /* Exercise the real table parser: dropped cells/rows, station order,
     duplicate stations, missing reaction sums and partial node responses. */
  source = input(code)
  const { built, results } = source
  S.mapiKey = `offline-results-${code}`
  ;(globalThis as any).fetch = async (_url: string, init: RequestInit) => {
    const a = JSON.parse(String(init.body)).Argument
    tableCalls.push(a.TABLE_TYPE)
    if (fault === 'unknown schema') return Response.json({})
    const body = resultTable(results, a, (kind, data) => {
      if (kind === 'BEAMFORCE') {
        if (fault === 'dropped station') data.splice(1, 1)
        if (fault === 'duplicate station') data[1] = data[0]
        if (fault === 'blank force') data[0][4] = ''
        if (fault === 'reversed stations') data.reverse()
      }
      if (kind === 'TRUSSFORCE' && fault === 'dropped truss') data.pop()
      if (kind === 'REACTIONG' && fault === 'dropped reaction') data.pop()
      if (kind === 'U' && fault === 'dropped sway node') data.pop()
      if (kind === 'U' && fault === 'reanalyzed') for (const row of data) row[3] = Number(row[3]) + 1e-4
      if (kind === 'S' && fault === 'dropped service node') data.pop()
    })
    /* 라이브 Gen 은 응답 최상위 키를 요청한 TABLE_NAME 대신 'Result Table'·'empty' 로 줄 때가 있다 (SDK unwrapTable) */
    const renamed = fault === 'renamed key' ? 'Result Table' : fault === 'empty key' ? 'empty' : null
    return Response.json(renamed && body ? { [renamed]: Object.values(body)[0] } : body)
  }
  for (const f of ['', 'reversed stations', 'renamed key', 'empty key']) {
    fault = f
    const parsed = await fetchResults(built)
    assert.deepEqual(parsed.beam, results.beam); passed++
  }
  for (const f of ['unknown schema', 'dropped station', 'duplicate station', 'blank force', 'dropped truss', 'dropped reaction', 'dropped sway node', 'dropped service node']) {
    fault = f
    await assert.rejects(() => fetchResults(built), ResultValidationError, `${code} parser ${f}`); passed++
  }
  /* 최적화 1회차 결과 재사용 — fetchResults 가 기록한 출처(같은 모델·같은 해석 회차) + Gen 처마 변위 지문이 같을 때만 */
  {
    fault = ''
    S.analysisRev = 1
    const parsed = await fetchResults(built)
    assert.equal(await reusableResults(results, built, 1), null, `${code} results not fetched from Gen are not reused`)
    tableCalls.length = 0
    assert.equal(await reusableResults(parsed, built, 1), parsed)
    assert.ok(tableCalls.length > 0 && tableCalls.every((c) => c === 'DISPLACEMENTG'), `${code} reuse check reads only the eave displacement table: ${tableCalls}`)
    assert.equal(await reusableResults(parsed, built, 2), null, `${code} other analysis run`)
    assert.equal(await reusableResults(parsed, { ...built }, 1), null, `${code} other model`)
    assert.equal(await reusableResults(null, built, 1), null)
    fault = 'reanalyzed'
    assert.equal(await reusableResults(parsed, built, 1), null, `${code} Gen re-analyzed outside the app`)
    for (const f of ['unknown schema', 'dropped sway node']) {
      fault = f
      assert.equal(await reusableResults(parsed, built, 1), null, `${code} unreadable eave table (${f}) → re-fetch instead of failing`)
    }
    fault = ''
    S.built = built; S.analyzed = true; S.analysisRev = 7
    await runDesignCheck()
    assert.ok(S.results && S.design, `${code} design check ok`)
    assert.equal(await reusableResults(S.results, built, 7), S.results, `${code} design check results are reusable`)
    passed += 10
  }
  // A failed re-check must not leave the previous successful design exportable.
  S.built = built; S.analyzed = true; S.design = design(); S.connections = []; S.opt = null
  fault = 'unknown schema'
  await runDesignCheck()
  assert.equal(S.design, null); assert.equal(S.connections, null); assert.equal(S.results, null)
  assert.ok(S.msgs.some((m) => m.kind === 'html' && msgText(m).includes(t('results_invalid', '').split('(')[0])))
  assert.equal(S.busy, false); assert.equal(S.job, null); passed++
  const report = buildReport({ built, reactions: null, design: S.design, connections: S.connections })
  assert.ok(report.includes(t('check_unavailable')))
  const status = report.split('<div class="status">')[1].split('</div>')[0]
  assert.ok(!status.includes('gr-pass')); passed++
  console.log(`${code}: complete data accepted; missing/corrupt data rejected`)
}
S.mapiKey = ''
/* 실패 문구는 현재 언어 — 문제 종류는 rv_* 키, 표 이름·요소·조합만 식별자 그대로 */
{
  const { failMsg } = await import('../src/actions/job')
  const { QuantityError } = await import('../src/domain/quantities')
  const m = failMsg(new ResultValidationError('BEAMFORCE', 'missing', '3 · LCB1'), (x) => x)
  assert.ok(m.includes(t('rv_missing')) && m.includes('BEAMFORCE · ') && !/\bmissing\b/.test(m), m); passed++
  const q = failMsg(new QuantityError('knee.stiffener'), (x) => x)
  assert.ok(q === t('q_invalid', 'knee.stiffener') && !/Invalid connection/.test(q), q); passed++
}
/* 표 본문 찾기·요청별 대기 한도 (mapi/client) */
{
  const { tableOf, timeoutFor, TIMEOUTS } = await import('../src/mapi/client')
  const tb = { HEAD: ['a'], DATA: [['1']] }
  assert.deepEqual(tableOf({ F: tb }), tb); assert.deepEqual(tableOf({ 'Result Table': tb }), tb); assert.deepEqual(tableOf({ empty: tb }), tb)
  const sumOnly = { SUB_TABLES: [{ 'SUMMATION OF REACTION FORCES PRINTOUT': { DATA: [] } }] }
  assert.deepEqual(tableOf({ Reaction: sumOnly }), sumOnly); assert.deepEqual(tableOf({}), {}); assert.deepEqual(tableOf(null), {}); assert.deepEqual(tableOf({ message: 'x' }), {})
  assert.equal(timeoutFor('/doc/anal'), TIMEOUTS.long); assert.equal(timeoutFor('/post/TABLE'), TIMEOUTS.long)
  assert.equal(timeoutFor('/doc/saveas'), TIMEOUTS.doc); assert.equal(timeoutFor('/db/NODE'), TIMEOUTS.short); assert.equal(timeoutFor('/view/ANGLE'), TIMEOUTS.short)
  assert.ok(TIMEOUTS.short <= 60_000 && TIMEOUTS.long >= 10 * 60_000)
  /* 실제 SDK timeout(응답하지 않는 fetch, 50 ms) → '응답 없음' 안내 (cause 'Timed out after …' 모양 확인) */
  const { MidasClient } = await import('midas-nx')
  const { apiErrorMessage } = await import('../src/mapi/client')
  const hang = (_u: unknown, init?: RequestInit) => new Promise<Response>((_, rej) => init?.signal?.addEventListener('abort', () => rej(init.signal!.reason)))
  const c = new MidasClient({ mapiKey: 'offline', product: 'gen', timeout: 50, fetch: hang as typeof fetch })
  const err = await c.request('GET', '/db/NODE').then(() => null, (e: unknown) => e)
  const msg = apiErrorMessage(err, 'GET /db/NODE')
  assert.equal(msg, t('gen_timeout', 0, 'GET /db/NODE'), msg)
  passed += 4
}
console.log(`Result integrity: ${passed} checks passed`)
