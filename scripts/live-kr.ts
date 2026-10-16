/* 한국 KDS 라이브 회귀 (명시적 실행). MAPI-Key 는 stdin 으로만 받아 메모리에만 둔다 — 파일·인자 금지.
   현재 Gen 문서를 자동 저장한 뒤 시험 모델을 만든다.
   실행: printf '<key>
' | node --import tsx scripts/live-kr.ts [--frame mono|multi] [--optimize] [--gen-check] [--assert-pass]
   --gen-check: PUT DESIGN/STEEL/DSTL 'KDS 41 30 : 2022' → POST .../CODE-ANAL(60 s 제한 — SDK 에 RC 판 정지 보고) → post/STEELCODECHECK,
   Gen KDS 강도비를 앱 검토와 역할별로 대조. Gen 기본 설계 옵션(부재 길이·K 자동)이라 수치는 참고 대조. */
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
const { KR_DEFAULT_SPEC } = await import('../src/domain/types')
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
S.mapiKey = key; key = ''; S.code = 'KR'
try {
  if (process.argv.includes('--reuse')) {
    const spec = structuredClone(KR_DEFAULT_SPEC), model = buildPortal(spec), loads = buildLoadPayloads(spec, model)
    S.built = { spec, model, info: loads.info, cases: Object.values(loads.STLD).map((x: any) => x.NAME), combos: Object.keys(loads['LCOM-GEN']).length, comboNames: Object.values(loads['LCOM-GEN']).map((x: any) => x.NAME) }; S.analyzed = true
  } else {
    const fr = process.argv.indexOf('--frame') > 0 ? process.argv[process.argv.indexOf('--frame') + 1] : 'gable'
    const { normalizeSpans } = await import('../src/domain/types')
    await sendModel(normalizeSpans({ ...structuredClone(KR_DEFAULT_SPEC), ...(fr === 'mono' ? { frame: 'mono' as const } : fr === 'multi' ? { frame: 'multi' as const, spanList: [24, 24] } : {}) }))
    console.log(`KR model transmitted (${fr}): nodes ${S.built!.model.nodes.length}, cases ${S.built!.cases.length}, combos ${S.built!.combos}.`)
    await analyzeCore()
    console.log('KR analysis completed.')
    /* 반력 평형 (D 제외 — 자중 BODF) */
    const b = S.built!, node = new Map(b.model.nodes.map((x) => [x.id, x])), applied: Record<string, number[]> = {}
    for (const [id, rec] of Object.entries(b.sent!.BMLD)) {
      const e = b.model.elements[+id - 1], a = node.get(e.n1)!, c = node.get(e.n2)!, L = Math.hypot(c.x - a.x, c.y - a.y, c.z - a.z)
      for (const it of (rec as any).ITEMS) { const o = (applied[it.LCNAME] ??= [0, 0, 0]); o[['GX', 'GY', 'GZ'].indexOf(it.DIRECTION)] += it.P[0] * L }
    }
    for (const rec of Object.values(b.sent!.CNLD)) for (const it of (rec as any).ITEMS) { const o = (applied[it.LCNAME] ??= [0, 0, 0]); o[0] += it.FX; o[1] += it.FY; o[2] += it.FZ }
    let worst = 0
    for (const r of S.reactions ?? []) { const lc = r.lc.replace(/\(ST\)$/, ''); if (lc === 'D') continue; const a = applied[lc] ?? [0, 0, 0]; worst = Math.max(worst, Math.max(Math.abs(r.fx + a[0]), Math.abs(r.fy + a[1]), Math.abs(r.fz + a[2])) / Math.max(1, Math.hypot(...a))) }
    console.log(`KR equilibrium worst ${(worst * 100).toFixed(3)}% over ${(S.reactions ?? []).length - 1} cases`)
  }
  S.results = await fetchResults(S.built!)
  S.design = runDesign(S.built!.spec, S.built!.model, S.built!.info, S.results)
  S.connections = runConnections(S.built!.spec, S.built!.model, S.built!.info, S.results)
  console.log(JSON.stringify({ phase: 'baseline', members: S.design.members.length, max: S.design.maxRatio, ng: S.design.ng, roles: Object.fromEntries(Object.entries(S.design.byRole).map(([r, m]) => [r, { ratio: m!.ratio, equation: m!.eq }])), service: S.design.service, connections: S.connections.map((x) => ({ type: x.type, ratio: x.ratio })) }, null, 2))
  if (process.argv.includes('--optimize')) {
    console.log('KR optimization started.')
    await runOptimize()
    if (!S.opt) throw new Error('Optimization failed: ' + JSON.stringify(S.msgs.at(-1)))
    console.log(JSON.stringify({ phase: 'optimized', weightBefore: S.opt.weightBefore, weightAfter: S.opt.weightAfter, iterations: S.opt.iters, sections: S.built!.spec.sections, memberNG: S.design!.ng, max: S.design!.maxRatio, connections: S.connections!.map((x) => ({ type: x.type, ratio: x.ratio })) }, null, 2))
  }
  if (process.argv.includes('--gen-check')) {
    const { mapi } = await import('../src/mapi/client')
    const timed = <T,>(p: Promise<T>, ms: number) => Promise.race([p, new Promise<never>((_, r) => setTimeout(() => r(new Error(`timeout ${ms} ms`)), ms))])
    try {
      await mapi('PUT', '/DESIGN/STEEL/DSTL', { Assign: { 1: { DGNCODE: 'KDS 41 30 : 2022' } } }, 'KDS steel code')
      /* Gen 강재 설계는 강재 설계용 조합이 따로 필요 — 없으면 CODE-ANAL 'failed:LoadCombination'(라이브 2026-10-16). 앱 조합을 STRENGTH 로 복사 */
      const steelCombos = Object.fromEntries(Object.entries<any>(S.built!.sent!['LCOM-GEN']).map(([k, c]) => [k, { NAME: c.NAME, ACTIVE: 'STRENGTH', iTYPE: 0, DESC: c.DESC, vCOMB: c.vCOMB }]))
      await mapi('POST', '/db/LCOM-STEEL', { Assign: steelCombos }, 'KDS steel design combinations')
      /* 설계 코드 지정 후 CODE-ANAL 이 'Please perform analysis.'(라이브 2026-10-16) → 같은 모델 재해석. analyzeCore 는 앱 결과를 비우므로 쓰지 않음 */
      console.log('Gen reanalysis:', JSON.stringify(await mapi('POST', '/doc/anal', {}, 'reanalysis for KDS check')))
      console.log('Gen CODE-ANAL:', JSON.stringify(await timed(mapi('POST', '/DESIGN/STEEL/KDS-41-30-2022/CODE-ANAL', { Argument: {} }, 'KDS code check'), 60000)))
      const r: any = await timed(mapi('POST', '/post/STEELCODECHECK', { Argument: {} }, 'KDS check table'), 60000)
      const rows: any[] = r?.vELEM ?? r?.STEELCODECHECK?.vELEM ?? []
      const genBy = new Map<number, number>(rows.map((x) => [Number(x.ELEM ?? x.ID), Number(x.RAT)]))
      const byRole: Record<string, { app: number; gen: number; n: number }> = {}
      for (const m of S.design!.members) { const g = genBy.get(m.id); if (g === undefined || !Number.isFinite(g)) continue; const o = byRole[m.role] ??= { app: 0, gen: 0, n: 0 }; o.app = Math.max(o.app, m.ratio); o.gen = Math.max(o.gen, g); o.n++ }
      console.log(JSON.stringify({ phase: 'gen-cross-check', genRows: rows.length, keys: rows[0] ? Object.keys(rows[0]) : [], byRole }, null, 2))
    } catch (e) { console.log('Gen cross-check unavailable:', e instanceof Error ? e.message : String(e)) }
  }
  const report = buildReport({ built: S.built!, reactions: S.reactions, design: S.design, connections: S.connections, opt: S.opt })
  const dxf = buildDxf({ spec: S.built!.spec, model: S.built!.model, connections: S.connections, title: 'KOREA KDS PORTAL FACTORY' })
  if (/TWN-|GB 50017|LRFD 13|SDS \/ SD1 \/ SMS/.test(report)) throw new Error('TW/CN reference leaked into KR report')
  for (const m of S.design!.members) if (!Number.isFinite(m.ratio) || m.ratio < 0) throw new Error(`Invalid design ratio: ${m.id}`)
  const output = join(tmpdir(), 'smart-midas-kr-live')
  writeFileSync(output + '.html', report); writeFileSync(output + '.dxf', dxf)
  writeFileSync(output + '-summary.json', JSON.stringify({ spec: S.built!.spec, reactions: S.reactions, design: S.design, connections: S.connections, opt: S.opt }, null, 2))
  console.log(JSON.stringify({ phase: 'outputs', report: output + '.html', dxf: output + '.dxf', apiErrors: S.log.filter((x) => x.type === 'err').map((x) => x.html), status: 'completed' }))
  if (process.argv.includes('--assert-pass') && (S.design!.ng || S.connections!.some((c) => c.ratio > 1) || S.log.some((x) => x.type === 'err'))) throw new Error('KR live regression: NG or API error remains')
} finally { S.mapiKey = ''; process.stdin.pause() }
