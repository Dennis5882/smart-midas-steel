/* 결과 회수 속도 라이브 비교 — live-guarded.ts 로 실행 (원본 저장·12 DB 복원).
   정상 모델링 → 해석 → 같은 해석 결과를 ① Gen 조합 표 그대로(mode 'combos') ② 케이스 표 × 계수 합(순정 모드 기본) 으로 읽어
   회수 시간, 부재력 최대 차이, 부재 강도비·접합 결과를 비교한다. 이어서 최적화(순정 모드) 시간.
   실행: node --import tsx scripts/live-guarded.ts -- scripts/live-results-speed.ts [--code TW|KR|CN] [--no-optimize] */
;(globalThis as any).document = { documentElement: { lang: 'ko', dataset: {} } }
const { readMapiKey } = await import('./mapi-key')
const { S } = await import('../src/state/store')
const { setConfirmHandler } = await import('../src/components/ConfirmDialog')
setConfirmHandler(() => true)
const { DEFAULT_SPEC, KR_DEFAULT_SPEC, CN_DEFAULT_SPEC } = await import('../src/domain/types')
const { buildFactory } = await import('../src/actions/build')
const { runAnalysis } = await import('../src/actions/analysis')
const { fetchResults, checkResults } = await import('../src/actions/results')
const { runOptimize } = await import('../src/actions/optimize')

const arg = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined }
const code = (arg('--code') ?? 'TW') as 'TW' | 'KR' | 'CN'
S.mapiKey = await readMapiKey(); S.code = code
const spec = structuredClone(code === 'KR' ? KR_DEFAULT_SPEC : code === 'CN' ? CN_DEFAULT_SPEC : DEFAULT_SPEC)
const t0 = Date.now(), sec = () => ((Date.now() - t0) / 1000).toFixed(0)
const errs = () => S.log.filter((x: any) => x.type === 'err').length
const last = () => JSON.stringify((S.msgs.at(-1) as any)?.html ?? '').slice(0, 300)

await buildFactory(spec)
await runAnalysis()
if (!S.analyzed) throw new Error(`analysis failed: ${last()}`)
const b = S.built!
console.log(`[${sec()}s] ${code} built + analysed: elems ${b.model.elements.length}, cases ${b.cases.length}, combos ${b.combos}`)

const timed = async (mode: 'auto' | 'combos') => { const s = Date.now(); const r = await fetchResults(b, { mode }); return { r, s: (Date.now() - s) / 1000 } }
const g = await timed('combos')
console.log(`[${sec()}s] ① Gen combination tables: ${g.s.toFixed(1)} s`)
const c = await timed('auto')
console.log(`[${sec()}s] ② case tables × factors: ${c.s.toFixed(1)} s (${(g.s / c.s).toFixed(1)}× faster)`)

/* 부재력 차이 — 표 소수 5자리 반올림만큼 */
let worst = 0, at = '', ref = 0
for (const [id, m] of g.r.beam) for (const [lc, pts] of m) pts.forEach((p, i) => {
  const q = c.r.beam.get(id)?.get(lc)?.[i]
  for (const k of ['P', 'Vy', 'Vz', 'My', 'Mz'] as const) { const d = Math.abs((q?.[k] ?? NaN) - p[k]); if (!(d <= worst)) { worst = d; at = `${id} ${lc} ${i} ${k}`; ref = p[k] } }
})
let trussWorst = 0
for (const [id, m] of g.r.truss) for (const [lc, f] of m) trussWorst = Math.max(trussWorst, Math.abs((c.r.truss.get(id)?.get(lc) ?? NaN) - f))
console.log(`beam force max |Δ| ${worst.toExponential(2)} (${at}, value ${ref.toFixed(3)}) · brace max |Δ| ${trussWorst.toExponential(2)}`)

const dg = checkResults(b, g.r), dc = checkResults(b, c.r)
let ratioWorst = 0
dg.design.members.forEach((m, i) => { ratioWorst = Math.max(ratioWorst, Math.abs(m.ratio - dc.design.members[i].ratio)) })
const conn = (x: typeof dg) => x.connections.map((k) => `${k.type}:${k.ratio.toFixed(4)}`).join(' ')
const svc = (x: typeof dg) => x.design.service.map((s) => `${s.key}:${s.ratio.toFixed(4)}`).join(' ')
console.log(`member ratio max |Δ| ${ratioWorst.toExponential(2)} (max ${dg.design.maxRatio.toFixed(4)} / ${dc.design.maxRatio.toFixed(4)}) · NG ${dg.design.ng}/${dc.design.ng}`)
console.log(`connections ① ${conn(dg)}\nconnections ② ${conn(dc)} · equal ${conn(dg) === conn(dc)}`)
console.log(`service equal ${svc(dg) === svc(dc)}`)

if (!process.argv.includes('--no-optimize')) {
  S.results = c.r; S.design = dc.design; S.connections = dc.connections
  const s = Date.now()
  await runOptimize()
  if (!S.opt) throw new Error(`optimize failed: ${last()}`)
  console.log(`[${sec()}s] optimize (case tables): ${((Date.now() - s) / 1000).toFixed(0)} s · ${S.opt.weightBefore.toFixed(2)} → ${S.opt.weightAfter.toFixed(2)} t, ${S.opt.iters.length} iter, max ${S.design!.maxRatio.toFixed(3)}, NG ${S.design!.ng}`)
}
console.log(`API errors ${errs()}`)
