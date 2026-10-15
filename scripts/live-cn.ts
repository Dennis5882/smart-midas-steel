/* Explicit opt-in live regression. Reads MAPI-Key from stdin, keeps it in
   memory only. Saves the current Gen document before creating a test model.
   Run: npx tsx scripts/live-cn.ts [--optimize]. Never put credentials here. */
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
const { CN_DEFAULT_SPEC } = await import('../src/domain/types')
const { sendModel } = await import('../src/actions/build')
const { analyzeCore } = await import('../src/actions/analysis')
const { fetchResults } = await import('../src/actions/results')
const { runDesign } = await import('../src/domain/design')
const { runConnections } = await import('../src/domain/connections')
const { runOptimize } = await import('../src/actions/optimize')
const { buildReport } = await import('../src/report/report')
const { buildDxf } = await import('../src/drawing/drawings')
const { buildPortal } = await import('../src/domain/portal')
const { buildLoadPayloads } = await import('../src/domain/loads')
if (process.argv.includes('--trace')) {
  const realFetch = globalThis.fetch
  globalThis.fetch = async (url, init) => {
    const path = new URL(String(url)).pathname, start = Date.now()
    console.log(`[API] ${init?.method ?? 'GET'} ${path}`)
    const response = await realFetch(url, init)
    console.log(`[API] ${path} ${response.status} headers ${Date.now() - start}ms`)
    return response
  }
}
S.mapiKey = key; key = ''; S.code = 'CN'
try {
  if (process.argv.includes('--reuse')) {
    const spec = structuredClone(CN_DEFAULT_SPEC), model = buildPortal(spec), loads = buildLoadPayloads(spec, model)
    S.built = { spec, model, info: loads.info, cases: Object.values(loads.STLD).map((x: any) => x.NAME), combos: Object.keys(loads['LCOM-GEN']).length, comboNames: Object.values(loads['LCOM-GEN']).map((x: any) => x.NAME) }; S.analyzed = true
  } else {
    await sendModel(structuredClone(CN_DEFAULT_SPEC))
    console.log('CN model transmitted.')
    await analyzeCore()
    console.log('CN analysis completed.')
  }
  S.results = await fetchResults(S.built!)
  S.design = runDesign(S.built!.spec, S.built!.model, S.built!.info, S.results)
  S.connections = runConnections(S.built!.spec, S.built!.model, S.built!.info, S.results)
  console.log(JSON.stringify({ phase: 'baseline', members: S.design.members.length, max: S.design.maxRatio, ng: S.design.ng, roles: Object.fromEntries(Object.entries(S.design.byRole).map(([r, m]) => [r, { ratio: m!.ratio, equation: m!.eq }])), service: S.design.service, connections: S.connections.map((x) => ({ type: x.type, ratio: x.ratio })) }, null, 2))
  if (process.argv.includes('--optimize')) {
    console.log('CN optimization started.')
    await runOptimize()
    if (!S.opt) throw new Error('Optimization failed: ' + JSON.stringify(S.msgs.at(-1)))
    console.log(JSON.stringify({ phase: 'optimized', weightBefore: S.opt.weightBefore, weightAfter: S.opt.weightAfter, iterations: S.opt.iters, sections: S.built!.spec.sections, memberNG: S.design!.ng, max: S.design!.maxRatio, connections: S.connections!.map((x) => ({ type: x.type, ratio: x.ratio })) }, null, 2))
  }
  const report = buildReport({ built: S.built!, reactions: S.reactions, design: S.design, connections: S.connections, opt: S.opt })
  const dxf = buildDxf({ spec: S.built!.spec, model: S.built!.model, connections: S.connections, title: 'CHINA GB PORTAL FACTORY' })
  if (/TWN-|LRFD 13|AISC DG|SDS \/ SD1/.test(report)) throw new Error('TW reference leaked into CN report')
  for (const m of S.design!.members) if (!Number.isFinite(m.ratio) || m.ratio < 0) throw new Error(`Invalid design ratio: ${m.id}`)
  const output = join(tmpdir(), 'smart-midas-cn-live')
  writeFileSync(output + '.html', report); writeFileSync(output + '.dxf', dxf)
  writeFileSync(output + '-summary.json', JSON.stringify({ spec: S.built!.spec, reactions: S.reactions, design: S.design, connections: S.connections, opt: S.opt }, null, 2))
  console.log(JSON.stringify({ phase: 'outputs', report: output + '.html', dxf: output + '.dxf', apiErrors: S.log.filter((x) => x.type === 'err').map((x) => x.html), status: 'completed' }))
  if (process.argv.includes('--assert-pass') && (S.design!.ng || S.connections!.some((c) => c.ratio > 1) || S.log.some((x) => x.type === 'err'))) throw new Error('CN live regression: NG or API error remains')
} finally { S.mapiKey = ''; process.stdin.pause() }
