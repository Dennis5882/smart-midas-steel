/* 작업 흐름 상태 회귀 (state/workflow, 순수) — 실행: node --import tsx scripts/verify-workflow.ts */
import assert from 'node:assert/strict'
import { workflow, specChanged, type WorkflowInput } from '../src/state/workflow'
import { DEFAULT_SPEC } from '../src/domain/types'
import { jobSteps } from '../src/state/jobSteps'

const built = { spec: DEFAULT_SPEC } as WorkflowInput['built']
const base: WorkflowInput = { built: null, analyzed: false, hasDesign: false, ngCount: 0, preview: null, genChanged: 0, job: null, lastFail: null }
const w = (o: Partial<WorkflowInput>) => workflow({ ...base, ...o })
let n = 0
const is = (a: unknown, b: unknown, what: string) => { n++; assert.deepEqual(a, b, what) }

is(w({}).next, 'start', 'empty → start')
is(w({ built }).next, 'anal', 'built → analysis')
is(w({ built, analyzed: true }).next, 'design', 'analyzed → design')
is(w({ built, analyzed: true, hasDesign: true }).next, 'output', 'designed → outputs')
is(w({ built, analyzed: true, hasDesign: true }).steps, { build: 'done', anal: 'done', design: 'done', output: 'next' }, 'all done')
/* Gen 변경 → 이후 단계 이전 결과, 다시 보내기 */
const g = w({ built, analyzed: true, hasDesign: true, genChanged: 2 })
is([g.next, g.reason, g.steps.design, g.steps.output], ['rebuild', 'gen', 'stale', 'stale'], 'Gen changed → stale + rebuild')
/* 입력 카드 변경 (Gen 에 아직 안 보냄) */
const e = w({ built, analyzed: true, hasDesign: true, preview: { ...DEFAULT_SPEC, span: 30 } })
is([e.next, e.reason, e.steps.anal], ['apply', 'edited', 'stale'], 'edited card → stale + apply')
/* 같은 스펙(키 순서만 다름)은 변경 아님 */
const reordered = Object.fromEntries(Object.entries(DEFAULT_SPEC).reverse()) as typeof DEFAULT_SPEC
is(specChanged(reordered, DEFAULT_SPEC), false, 'key order is not a change')
is(specChanged({ ...DEFAULT_SPEC, bayList: undefined }, DEFAULT_SPEC), false, 'undefined field is not a change')
is(w({ built, preview: reordered }).reason, 'none', 'same spec preview → no stale')
/* 실패·취소 → 그 단계 실패 표시 + 다시 시도 */
const f = w({ built, analyzed: true, lastFail: { kind: 'design', cancelled: false } })
is([f.steps.design, f.next, f.reason], ['failed', 'retry', 'failed'], 'design failed → retry')
is(w({ built: null, lastFail: { kind: 'build', cancelled: true } }).reason, 'cancelled', 'build cancelled')
is(w({ built: null, lastFail: { kind: 'build', cancelled: true } }).next, 'start', 'cancelled build w/o model → start')
/* 실행 중 → 버튼 없음 */
const r = w({ built, job: 'anal' })
is([r.steps.anal, r.next], ['running', null], 'running → no next button')
/* 작업 단계 목록 — 생성은 MAPI 경로로 세분 */
const st = (kind: any, stage: string, detail: string) => jobSteps({ kind, stage, detail }).map((x) => x.status[0]).join('')
is(st('build', 'st_send', 'POST /doc/saveas'), 'nttttt', 'build: backup now')
is(st('build', 'st_send', 'PUT /db/SECT'), 'ddnttt', 'build: materials/sections')
is(st('build', 'st_send', 'PUT /db/ELEM'), 'dddntt', 'build: nodes/elements')
is(st('build', 'st_send', 'PUT /db/LCOM-GEN'), 'ddddnt', 'build: loads/combos')
is(st('build', 'st_verify', 'GET /db/NODE'), 'dddddn', 'build: verify')
is(st('anal', 'st_anal', 'POST /doc/anal'), 'ddnt', 'analysis running')
is(st('design', 'st_check', ''), 'ddn', 'design checking')
console.log(`Workflow: ${n} checks passed`)
