/* 대만(TW) 라이브 회귀 — live-cn.ts 와 같은 방식. MAPI-Key 는 표준입력으로 받아 메모리에만 둔다(파일·인자 금지).
   현재 Gen 문서를 자동 저장한 뒤 새 모델을 만든다 → 시험용 Gen 세션에서 실행.
   실행: node --import tsx scripts/live-tw.ts [--optimize] [--out <경로 접두사>]
   출력: <out>.html (계산서) · .dxf · -summary.json (스펙·반력·검토·접합·최적화 — 계산서 재생성용) */
import { createInterface } from 'node:readline'
import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const lines = createInterface({ input: process.stdin, terminal: false })
console.log('Waiting for MAPI-Key on stdin (not echoed).')
let key = ''
for await (const line of lines) { key = line.trim(); lines.close(); break }
if (!key) throw new Error('MAPI-Key required on stdin')
;(globalThis as any).document = { documentElement: { lang: 'ko', dataset: {} } }
const { S } = await import('../src/state/store')
const { DEFAULT_SPEC } = await import('../src/domain/types')
const { sendModel } = await import('../src/actions/build')
const { analyzeCore } = await import('../src/actions/analysis')
const { fetchResults } = await import('../src/actions/results')
const { runDesign } = await import('../src/domain/design')
const { runConnections } = await import('../src/domain/connections')
const { runOptimize } = await import('../src/actions/optimize')
const { buildReport } = await import('../src/report/report')
const { buildDxf } = await import('../src/drawing/drawings')
const { summarizeStatus } = await import('../src/domain/status')
const { checkScope } = await import('../src/domain/scope')

const arg = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined }
const output = arg('--out') ?? join(tmpdir(), 'smart-midas-tw-live')
S.mapiKey = key; key = ''; S.code = 'TW'
const t0 = Date.now()
const sec = () => `${((Date.now() - t0) / 1000).toFixed(0)}s`
try {
  const spec = structuredClone(DEFAULT_SPEC)
  if (checkScope(spec).blocked) throw new Error('sample spec is out of scope')
  await sendModel(spec)
  console.log(`[${sec()}] TW model sent: nodes ${S.built!.model.nodes.length}, elems ${S.built!.model.elements.length}, cases ${S.built!.cases.length}, combos ${S.built!.combos}`)
  await analyzeCore()
  console.log(`[${sec()}] analysis done; reactions ${S.reactions?.length ?? 0}`)
  S.results = await fetchResults(S.built!)
  S.design = runDesign(S.built!.spec, S.built!.model, S.built!.info, S.results)
  S.connections = runConnections(S.built!.spec, S.built!.model, S.built!.info, S.results)
  const st = () => summarizeStatus(S.design, S.connections, checkScope(S.built!.spec))
  console.log(`[${sec()}] baseline: max ${S.design.maxRatio.toFixed(3)} NG ${S.design.ng} status ${st().overall}; conns ${S.connections.map((c) => `${c.type} ${c.ratio.toFixed(3)}`).join(', ')}`)
  if (process.argv.includes('--optimize')) {
    await runOptimize()
    if (!S.opt) throw new Error('optimization failed: ' + JSON.stringify(S.msgs.at(-1)))
    console.log(`[${sec()}] optimized: ${S.opt.weightBefore.toFixed(2)} -> ${S.opt.weightAfter.toFixed(2)} t, iters ${S.opt.iters.length}, max ${S.design!.maxRatio.toFixed(3)} NG ${S.design!.ng} status ${st().overall}`)
  }
  const report = buildReport({ built: S.built!, reactions: S.reactions, design: S.design, connections: S.connections, opt: S.opt })
  const dxf = buildDxf({ spec: S.built!.spec, model: S.built!.model, connections: S.connections, title: 'TAIWAN LRFD PORTAL FACTORY' })
  writeFileSync(output + '.html', report); writeFileSync(output + '.dxf', dxf)
  writeFileSync(output + '-summary.json', JSON.stringify({ spec: S.built!.spec, reactions: S.reactions, design: S.design, connections: S.connections, opt: S.opt }, null, 2))
  const errs = S.log.filter((x) => x.type === 'err').map((x) => x.html)
  console.log(`[${sec()}] outputs: ${output}.html / .dxf / -summary.json; API errors ${errs.length}${errs.length ? ': ' + errs.join(' | ') : ''}`)
} finally { S.mapiKey = ''; process.stdin.pause() }
