/* 골조 쌍 탐색 회귀 — 가지치기 탐색(무게 break·필요할 때만 강도)이 전수 탐색(ctl.exhaustive)과 같은 제안을 내는지.
   후보 정렬이 무게 순이 아니게 바뀌면 더 가벼운 유효 쌍을 놓치는데, 여기서 잡힌다.
   정답 세트 Gen 결과(TW·CN·KR)로 증폭·하한·금지·목표 제어를 섞어 확인. 실행: node --import tsx scripts/verify-opt-search.ts */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { buildLoadPayloads } from '../src/domain/loads'
import { buildPortal } from '../src/domain/portal'
import { runDesign } from '../src/domain/design'
import { proposeSections, type OptControl } from '../src/domain/optimize'
import { decodeResults, fixtureFor } from './tw-golden'

let passed = 0
const t0 = performance.now()
for (const code of ['TW', 'CN', 'KR'] as const) {
  const fx = JSON.parse(gunzipSync(readFileSync(fixtureFor(code))).toString())
  const spec = fx.spec, model = buildPortal(spec), info = buildLoadPayloads(spec, model).info, res = decodeResults(fx.results)
  const d = runDesign(spec, model, info, res)
  const cases: Record<string, OptControl> = {
    TW: { floors: {}, amp: {}, bans: [{ column: spec.sections.column, rafter: spec.sections.rafter }] },
    CN: { amp: { column: 1.2, rafter: 1.1 }, floors: {}, bans: [] },
    KR: { target: 0.8, floors: { column: 100e2 }, bans: [], amp: {} },
  }
  for (const ctl of [{}, cases[code]]) {
    const fast = proposeSections(spec, model, info, res, d, ctl)
    const ref = proposeSections(spec, model, info, res, d, { ...ctl, exhaustive: true })
    assert.deepEqual(fast, ref, `${code} ${JSON.stringify(ctl)}`)
    passed++
  }
}
console.log(`Frame pair search: ${passed} cases match exhaustive search (TW/CN/KR, amp/floor/ban/target) in ${((performance.now() - t0) / 1000).toFixed(0)}s`)
