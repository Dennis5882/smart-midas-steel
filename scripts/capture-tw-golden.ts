/* 기준 모델 정답 세트 갱신 (TW 기본, --code CN) — 라이브 Gen 해석 결과(부재력·반력·변위)를 fixture 로 저장하고, 그 결과로 계산한 설계·접합 검토를 정답으로 기록.
   verify-tw.ts(TW)·verify-golden.ts(CN) 가 이 fixture 로 Gen 없이 설계·접합 검토를 다시 돌려 정답과 대조한다.
   실행: printf '<key>\n' | node --import tsx scripts/capture-tw-golden.ts [--code CN]   (키는 stdin 만 — 파일·인자 금지)
   설계식을 의도적으로 바꿨으면 Gen 없이 정답만 갱신: verify-tw.ts --update / verify-golden.ts --code CN --update */
import { createInterface } from 'node:readline'
import { writeFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'

const code = process.argv[process.argv.indexOf('--code') + 1] === 'CN' ? 'CN' : 'TW'
const lines = createInterface({ input: process.stdin, terminal: false })
console.log(`Waiting for MAPI-Key on stdin (not echoed). Code ${code}.`)
let key = ''
for await (const line of lines) { key = line.trim(); lines.close(); break }
if (!key) throw new Error('MAPI-Key required on stdin')
;(globalThis as any).document = { documentElement: { lang: 'ko', dataset: {} } }
const { S } = await import('../src/state/store')
const { CN_DEFAULT_SPEC, DEFAULT_SPEC } = await import('../src/domain/types')
const { sendModel } = await import('../src/actions/build')
const { analyzeCore } = await import('../src/actions/analysis')
const { fetchResults } = await import('../src/actions/results')
const { fixtureFor, encodeResults, golden } = await import('./tw-golden')

S.mapiKey = key; key = ''; S.code = code
const spec = structuredClone(code === 'CN' ? CN_DEFAULT_SPEC : DEFAULT_SPEC)
await sendModel(spec)
await analyzeCore()
const res = await fetchResults(S.built!)
const fixture = { captured: new Date().toISOString(), spec, reactions: S.reactions, results: encodeResults(res) }
fixture.golden = golden(spec, res) as never
const FIXTURE = fixtureFor(code)
writeFileSync(FIXTURE, gzipSync(JSON.stringify(fixture)))
console.log(`fixture written: ${FIXTURE}`)
console.log(JSON.stringify((fixture as any).golden.summary))
