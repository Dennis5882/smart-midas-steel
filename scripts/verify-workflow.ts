/* 스펙 변경 판정·작업 단계 목록 회귀 (state/taskFlow.specChanged, state/jobSteps — 순수) — 실행: node --import tsx scripts/verify-workflow.ts */
import assert from 'node:assert/strict'
import { specChanged } from '../src/state/taskFlow'
import { DEFAULT_SPEC } from '../src/domain/types'
import { jobSteps } from '../src/state/jobSteps'

let n = 0
const is = (a: unknown, b: unknown, what: string) => { n++; assert.deepEqual(a, b, what) }

/* 입력 카드 ≠ Gen 에 보낸 스펙 판정 (단계 상태·버튼 규칙은 verify-task-flow) */
is(specChanged({ ...DEFAULT_SPEC, span: 30 }, DEFAULT_SPEC), true, 'edited span is a change')
const reordered = Object.fromEntries(Object.entries(DEFAULT_SPEC).reverse()) as typeof DEFAULT_SPEC
is(specChanged(reordered, DEFAULT_SPEC), false, 'key order is not a change')
is(specChanged({ ...DEFAULT_SPEC, bayList: undefined }, DEFAULT_SPEC), false, 'undefined field is not a change')
is(specChanged(null, DEFAULT_SPEC), false, 'no draft → no change')
/* 작업 단계 목록 — 생성은 MAPI 경로로 세분 */
const st = (kind: any, stage: string, detail: string) => jobSteps({ kind, stage, detail }).map((x) => x.status[0]).join('')
is(st('build', 'st_send', 'POST /doc/saveas'), 'nttttt', 'build: backup now')
is(st('build', 'st_send', 'PUT /db/SECT'), 'ddnttt', 'build: materials/sections')
is(st('build', 'st_send', 'PUT /db/ELEM'), 'dddntt', 'build: nodes/elements')
is(st('build', 'st_send', 'PUT /db/LCOM-GEN'), 'ddddnt', 'build: loads/combos')
is(st('build', 'st_verify', 'GET /db/NODE'), 'dddddn', 'build: verify')
is(st('anal', 'st_anal', 'POST /doc/anal'), 'ddnt', 'analysis running')
is(st('design', 'st_check', ''), 'ddn', 'design checking')
is(st('docx', 'docx_start', ''), 'n', 'Word report job shows its own step')
is(st('dwgpdf', 'dwg_pdf_start', ''), 'n', 'drawing PDF job shows its own step')
{
  const { parseCommand } = await import('../src/agent/parse')
  is(parseCommand('도면 PDF').intent, 'drawings_pdf', 'drawing PDF command')
  is(parseCommand('drawings pdf').intent, 'drawings_pdf', 'drawing PDF command (en)')
  is(parseCommand('계산서 PDF 도면 포함').intent, 'pdf', 'report PDF that mentions drawings stays a report')
  is(parseCommand('計算書 PDF（含示意圖）').intent, 'pdf', 'report PDF with 圖 stays a report')
  is(parseCommand('도면').intent, 'drawings', 'plain drawing command is DXF')
}
/* 진행 막대의 호출 설명 — API 코드 옆 문구 (mapi/describe.ts) */
{
  ;(globalThis as any).document ??= { documentElement: { lang: 'ko', dataset: {} } }
  const { describeCall } = await import('../src/mapi/describe')
  const { setLang } = await import('../src/i18n')
  setLang('ko')
  const d = (m: string, ep: string, body?: any) => describeCall(m, ep, body)?.() ?? null
  const tbl = (type: string, keys: number, loads: string[]) => ({ Argument: { TABLE_TYPE: type, NODE_ELEMS: { KEYS: Array(keys).fill(1) }, LOAD_CASE_NAMES: loads } })
  is(d('POST', '/post/TABLE', tbl('BEAMFORCE', 410, Array(21).fill('D(ST)'))), '부재력 읽는 중 — 요소·절점 410개 × 하중 케이스 21개', 'case table read')
  is(d('POST', '/post/TABLE', tbl('BEAMFORCE', 410, ['A(CB)', 'B(CB)'])), '부재력 읽는 중 — 요소·절점 410개 × 하중 조합 2개', 'combination table read')
  is(d('PUT', '/db/SECT', { Assign: { 1: {}, 2: {} } }), 'Gen 에 단면 보내는 중 (2개)', 'PUT names the table and count')
  is(d('GET', '/db/LCOM-GEN'), 'Gen 에서 하중 조합 다시 읽어 확인', 'GET is a readback check')
  is(d('PUT', '/db/XYZ', { Assign: {} }), 'Gen 에 XYZ 보내는 중 (0개)', 'unknown table keeps its code')
  is(d('POST', '/doc/anal/'), describeCall('POST', '/doc/anal', {})!(), 'trailing slash ignored')
  is(d('POST', '/unknown'), null, 'unknown path → API code only')
  setLang('en')
  is(d('PUT', '/db/NODE', { Assign: { 1: {} } }), 'Sending nodes to Gen (1)', 'rendered in the current language')
}
console.log(`Spec change / job steps: ${n} checks passed`)
