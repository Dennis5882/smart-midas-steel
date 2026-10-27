/* Gen 엔지니어 하중 읽어 오기(F2 1단계) 라이브 확인 — live-guarded.ts 로 실행 (원본 저장·12 DB 복원).
   ① 정상 모델링 → 해석 → 설계 검토 (기준)
   ② 모델 + 자중만 → 엔지니어처럼 같은 하중(케이스·조합 전부)을 Gen 에 직접 PUT → [Gen 하중 불러오기] → 확정 → 해석 → 설계 검토
   비교: 조합 용도 추정 = 앱 용도, 부재 강도비·접합(13장 포함, 처마는 V(13.3-1) 상한이 보수적일 수 있음), 케이스별 해석 전 합산 = 해석 후 반력, 읽기 중 없는 표 응답.
   실행: node --import tsx scripts/live-guarded.ts -- scripts/live-genloads.ts */
;(globalThis as any).document = { documentElement: { lang: 'ko', dataset: {} } }
import { writeFileSync } from 'node:fs'
const { readMapiKey } = await import('./mapi-key')
const { S } = await import('../src/state/store')
const { setConfirmHandler } = await import('../src/components/ConfirmDialog')
setConfirmHandler(() => true)
const { DEFAULT_SPEC } = await import('../src/domain/types')
const { buildPortal } = await import('../src/domain/portal')
const { buildLoadPayloads } = await import('../src/domain/loads')
const { buildFactory } = await import('../src/actions/build')
const { runAnalysis } = await import('../src/actions/analysis')
const { runDesignCheck } = await import('../src/actions/design')
const { runOptimize } = await import('../src/actions/optimize')
const { readGenLoads, acceptGenLoads, acceptUnavailable } = await import('../src/actions/readback')
const { mapi } = await import('../src/mapi/client')

S.mapiKey = await readMapiKey(); S.code = 'TW'
const spec = structuredClone(DEFAULT_SPEC)
const t0 = Date.now(), sec = () => ((Date.now() - t0) / 1000).toFixed(0)
const errs = () => S.log.filter((x: any) => x.type === 'err').length
const last = () => { const m: any = S.msgs.at(-1); return typeof m?.html === 'string' ? m.html : JSON.stringify(m?.html ?? '') }
const ratios = () => new Map(S.design!.members.map((m) => [m.id, m.ratio]))

/* ① 기준 */
await buildFactory(spec)
await runAnalysis()
await runDesignCheck()
if (!S.design) throw new Error(`baseline design failed: ${last()}`)
const base = ratios(), baseConn = S.connections!.map((c) => `${c.type}:${c.ratio.toFixed(4)}`).join(' '), baseMax = S.design.maxRatio, baseSvc = S.design.service.map((s) => `${s.key}:${s.ratio.toFixed(3)}`)
console.log(`[${sec()}s] baseline: members ${base.size} max ${baseMax.toFixed(4)} combos ${S.built!.combos} errors ${errs()}`)
await runOptimize()
const optBase = S.opt ? { before: S.opt.weightBefore, after: S.opt.weightAfter, ok: S.opt.ok, iters: S.opt.iters.length, max: S.design!.maxRatio, sections: S.built!.spec.sections } : null
console.log(`[${sec()}s] baseline optimize: ${optBase ? `${optBase.before.toFixed(2)} → ${optBase.after.toFixed(2)} t, ${optBase.iters} iter, max ${optBase.max.toFixed(3)}, ok ${optBase.ok}` : last()}`)

/* ② 모델 + 자중만 → 엔지니어 하중 입력 (일반 조합만 — 증폭 지진·중력·ASD 조합은 엔지니어가 따로 정할 몫) */
await buildFactory(spec, { modelOnly: true })
const l = buildLoadPayloads(spec, buildPortal(spec))
/* 2단계: 조합 전부(일반·증폭 지진 E′·13.6.1 중력) — 앱 추정 용도가 앱이 붙인 용도와 같은지, 13장 접합까지 같은지 */
for (const [db, a] of [['STLD', l.STLD], ['BMLD', l.BMLD], ['CNLD', l.CNLD], ['LCOM-GEN', l['LCOM-GEN']]] as const) await mapi('PUT', db, { Assign: a }, `engineer ${db}`)
const before = errs()
await readGenLoads()
const absentErrors = errs() - before
const r = S.genRead
if (!r) throw new Error(`readback failed: ${last()}`)
console.log(`[${sec()}s] read: cases ${r.summary.cases.length} combos ${r.summary.combos.length} opaque [${r.summary.opaque}] notices [${r.summary.notices}] block ${acceptUnavailable()} · GET errors for absent tables ${absentErrors}`)
const kindMiss = r.summary.combos.filter((c) => c.kind !== l.info.comboKind[c.name]).map((c) => c.name)
console.log(`guessed combo purposes = app: ${kindMiss.length === 0} ${kindMiss.slice(0, 5)}`)
await acceptGenLoads()
await runAnalysis()
if (!S.analyzed) throw new Error(`analysis failed: ${last()}`)
/* 해석 전 합산 vs 반력 (반력 = −하중) */
const react = new Map(S.reactions!.map((x) => [x.lc, x]))
let worst = { lc: '', d: 0 }
for (const c of S.built!.genLoads!.cases) {
  const x = react.get(c.name)
  if (!x) continue
  const d = Math.max(Math.abs(c.sum.fx + x.fx), Math.abs(c.sum.fy + x.fy), Math.abs(c.sum.fz + x.fz)) / Math.max(1, Math.abs(c.sum.fz), Math.abs(c.sum.fx), Math.abs(c.sum.fy))
  if (d > worst.d) worst = { lc: c.name, d }
}
const D = S.built!.genLoads!.cases.find((c) => c.name === 'D')!, rD = react.get('D')!
console.log(`[${sec()}s] reactions: worst sum-vs-reaction ${worst.lc} ${(worst.d * 100).toFixed(3)}% · D estimate ${(-D.sum.fz).toFixed(1)} vs Gen ${rD.fz.toFixed(1)} kN`)
await runDesignCheck()
if (!S.design) throw new Error(`readback design failed: ${last()}`)
const now = ratios()
let maxDiff = 0, at = 0
for (const [id, v] of base) { const d = Math.abs((now.get(id) ?? NaN) - v); if (!(d <= maxDiff)) { maxDiff = d; at = id } }
const svc = S.design.service.map((s) => `${s.key}:${s.ratio.toFixed(3)}`)
const genConn = S.connections!.map((c) => `${c.type}:${c.ratio.toFixed(4)}`).join(' ')
console.log(`connections baseline ${baseConn}`)
console.log(`connections readback ${genConn}`)
console.log(`[${sec()}s] readback design: max ${S.design.maxRatio.toFixed(4)} (baseline ${baseMax.toFixed(4)}) · member ratio max |Δ| ${maxDiff.toExponential(2)} at ${at}`)
console.log(`service baseline ${baseSvc.join(' ')}`)
console.log(`service readback ${svc.join(' ')}`)
/* 2단계 — 엔지니어 하중 그대로 단면만 바꿔 최적화 */
const engLoads = async () => JSON.stringify(await Promise.all(['STLD', 'BMLD', 'CNLD', 'LCOM-GEN'].map((db) => mapi('GET', db, undefined, 'check'))))
const eng0 = await engLoads(), logMark = S.log.length
await runOptimize()
const docNew = S.log.slice(logMark).filter((x: any) => /\/doc\/new/.test(String(x.text ?? x.html ?? x.msg ?? ''))).length
const eng1 = await engLoads()
const optGen = S.opt ? { before: S.opt.weightBefore, after: S.opt.weightAfter, ok: S.opt.ok, iters: S.opt.iters.length, max: S.design!.maxRatio, sections: S.built!.spec.sections, genLoads: !!S.built!.genLoads } : null
console.log(`[${sec()}s] engineer-load optimize: ${optGen ? `${optGen.before.toFixed(2)} → ${optGen.after.toFixed(2)} t, ${optGen.iters} iter, max ${optGen.max.toFixed(3)}, ok ${optGen.ok}, genLoads kept ${optGen.genLoads}` : last()} · doc/new during optimize ${docNew} · engineer loads unchanged ${eng0 === eng1}`)
if (optBase && optGen) for (const k of Object.keys(optBase.sections) as (keyof typeof optBase.sections)[]) if (optBase.sections[k] !== optGen.sections[k]) console.log(`  section ${k}: app-loads ${optBase.sections[k]} / engineer-loads ${optGen.sections[k]}`)
console.log(`API errors (excluding absent-table GETs) ${errs() - absentErrors}`)
writeFileSync('output/live-genloads.json', JSON.stringify({ baseMax, readMax: S.design.maxRatio, maxDiff, at, worst, absentErrors, baseSvc, svc, optBase, optGen, docNew, engineerLoadsUnchanged: eng0 === eng1, opaque: r.summary.opaque, notices: r.summary.notices }, null, 2))
