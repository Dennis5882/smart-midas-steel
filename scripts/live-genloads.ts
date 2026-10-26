/* Gen 엔지니어 하중 읽어 오기(F2 1단계) 라이브 확인 — live-guarded.ts 로 실행 (원본 저장·12 DB 복원).
   ① 정상 모델링 → 해석 → 설계 검토 (기준)
   ② 모델 + 자중만 → 엔지니어처럼 같은 하중(케이스 전부·일반 조합만)을 Gen 에 직접 PUT → [Gen 하중 불러오기] → 확정 → 해석 → 설계 검토
   비교: 부재 강도비(같아야 함 — 일반 부재 검토는 basic 조합만), 케이스별 해석 전 합산 = 해석 후 반력, 읽기 중 없는 표 응답.
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
const base = ratios(), baseMax = S.design.maxRatio, baseSvc = S.design.service.map((s) => `${s.key}:${s.ratio.toFixed(3)}`)
console.log(`[${sec()}s] baseline: members ${base.size} max ${baseMax.toFixed(4)} combos ${S.built!.combos} errors ${errs()}`)

/* ② 모델 + 자중만 → 엔지니어 하중 입력 (일반 조합만 — 증폭 지진·중력·ASD 조합은 엔지니어가 따로 정할 몫) */
await buildFactory(spec, { modelOnly: true })
const l = buildLoadPayloads(spec, buildPortal(spec))
const basic = Object.fromEntries(Object.entries(l['LCOM-GEN']).filter(([, c]: any) => l.info.comboKind[c.NAME] === 'basic'))
for (const [db, a] of [['STLD', l.STLD], ['BMLD', l.BMLD], ['CNLD', l.CNLD], ['LCOM-GEN', basic]] as const) await mapi('PUT', db, { Assign: a }, `engineer ${db}`)
const before = errs()
await readGenLoads()
const absentErrors = errs() - before
const r = S.genRead
if (!r) throw new Error(`readback failed: ${last()}`)
console.log(`[${sec()}s] read: cases ${r.summary.cases.length} combos ${r.summary.combos.length} opaque [${r.summary.opaque}] notices [${r.summary.notices}] block ${acceptUnavailable()} · GET errors for absent tables ${absentErrors}`)
acceptGenLoads()
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
console.log(`[${sec()}s] readback design: max ${S.design.maxRatio.toFixed(4)} (baseline ${baseMax.toFixed(4)}) · member ratio max |Δ| ${maxDiff.toExponential(2)} at ${at}`)
console.log(`service baseline ${baseSvc.join(' ')}`)
console.log(`service readback ${svc.join(' ')}`)
console.log(`API errors (excluding absent-table GETs) ${errs() - absentErrors}`)
writeFileSync('output/live-genloads.json', JSON.stringify({ baseMax, readMax: S.design.maxRatio, maxDiff, at, worst, absentErrors, baseSvc, svc, opaque: r.summary.opaque, notices: r.summary.notices }, null, 2))
