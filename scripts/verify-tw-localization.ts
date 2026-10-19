/* 대만 현지화 보완 회귀 (v2.5.0 후보 — 2026-10-20): 퍼린·거트 재료 분리, 표1-3 횡력저항시스템, 용접 근거, 簽證 대응표,
   냉간형강 남은 항목(6.5 皺曲·10.6.1 R·클리트·새그로드), 강접 내부 기둥, 工址 근거. Gen·키 불필요.
   node --import tsx scripts/verify-tw-localization.ts */
import './_dom-stub'
import assert from 'node:assert/strict'
import { DEFAULT_SPEC, normalizeSpans, CN_DEFAULT_SPEC } from '../src/domain/types'
import { buildPortal } from '../src/domain/portal'
import { buildGenPayloads } from '../src/domain/gen'
import { runDesign } from '../src/domain/design'
import { runConnections } from '../src/domain/connections'
import { checkScope } from '../src/domain/scope'
import { modelingSectionChoices } from '../src/domain/sectionCatalog'
import { sectionProps } from '../src/domain/sections'
import { ccDims, cfCapacity } from '../src/codes/twColdFormed'
import { webCrippling, rFactor, boltBearing } from '../src/codes/twCfDetails'
import { TW_SYSTEMS_X, TW_SYSTEMS_Y } from '../src/codes/twSystems'
import { weldSchedule } from '../src/domain/twWelding'
import { reviewItems } from '../src/domain/twReview'
import { footingGroups } from '../src/domain/twFoundation'
import { initVals, toSpec } from '../src/components/planFields'
import { rSourceText } from '../src/components/Status'
import { buildDxf } from '../src/drawing/drawings'
import { krSynthetic } from './kr-synth'
let n = 0
const ok = (c: unknown, m: string) => { assert.ok(c, m); n++ }
const near = (a: number, b: number, tol: number, m: string) => ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${m}: ${a} vs ${b}`)

/* 1. 퍼린·거트 재료 분리 */
{
  const spec = { ...structuredClone(DEFAULT_SPEC), secondaryMaterial: 'SSC400' }
  const model = buildPortal(spec), gp = buildGenPayloads(spec, model)
  ok((gp.MATL as any)[2]?.PARAM[0].DB === 'SSC400' && (gp.MATL as any)[1].PARAM[0].DB === 'SN400', 'Gen MATL 1 = SN400, 2 = SSC400')
  ok(model.elements.filter((e) => e.role === 'purlin' || e.role === 'girt').every((e) => (gp.ELEM[e.id] as any).MATL === 2) && model.elements.filter((e) => e.role === 'column').every((e) => (gp.ELEM[e.id] as any).MATL === 1), 'purlins/girts MATL 2, frame MATL 1')
  ok(!(buildGenPayloads(DEFAULT_SPEC, buildPortal(DEFAULT_SPEC)).MATL as any)[2], 'default TW keeps one material (golden unchanged)')
  ok(modelingSectionChoices(spec, 'purlin', spec.sections.purlin).material === 'SSC400' && modelingSectionChoices(spec, 'column', spec.sections.column).material === 'SN400B', 'section picker uses the role material')
  const syn = krSynthetic(spec), base = krSynthetic(DEFAULT_SPEC)
  const d = runDesign(spec, syn.model, syn.loads.info, syn.results), d0 = runDesign(DEFAULT_SPEC, base.model, base.loads.info, base.results)
  const pr = (x: typeof d) => x.members.filter((m) => m.role === 'purlin').map((m) => m.cap.phiMnx)
  ok(Math.max(...pr(d)) > Math.max(...pr(d0)), 'purlin capacity uses Fy 245 (SSC400) instead of 235')
  const v = initVals(DEFAULT_SPEC)
  ok(toSpec(DEFAULT_SPEC, v, false).secondaryMaterial === undefined && toSpec(DEFAULT_SPEC, { ...v, secondaryMaterial: 'SSC400' }, false).secondaryMaterial === 'SSC400', 'card: blank = same as main, SSC400 stored')
}
/* 2. 표1-3 시스템 */
{
  ok(TW_SYSTEMS_X.IMF.R === 3.2 && TW_SYSTEMS_X.SMF.R === 4.8 && TW_SYSTEMS_Y.OCBF.R === 2.0 && TW_SYSTEMS_Y.SCBF.R === 3.6 && TW_SYSTEMS_Y.SCBF.hMax === 50, 'table 1-3 values')
  const v = initVals(DEFAULT_SPEC)
  ok(toSpec(DEFAULT_SPEC, v, false).seismic.systemX === undefined, 'default system not written (golden unchanged)')
  const smf = toSpec(DEFAULT_SPEC, { ...v, 'seismic.systemX': 'SMF', 'seismic.Rx': '4.8', 'seismic.systemY': 'SCBF', 'seismic.Ry': '3.6' }, false)
  ok(smf.seismic.systemX === 'SMF' && smf.seismic.Rx === 4.8 && smf.seismic.systemY === 'SCBF', 'card stores SMF/SCBF with R')
  ok(checkScope(smf).issues.some((i) => i.key === 'twSystemSpecial'), 'special systems → expert warning')
  ok(rSourceText(smf).includes('三、1.(1)') && rSourceText({ ...smf, seismic: { ...smf.seismic, Rx: 4.0 } }).includes('4.8'), 'R source: table row / user input with table value')
  const tall = { ...structuredClone(DEFAULT_SPEC), eaveHeight: 13 }
  ok(checkScope(tall).issues.some((i) => i.key === 'hnR') && !checkScope({ ...tall, seismic: { ...tall.seismic, systemX: 'SMF' as const, systemY: 'SCBF' as const } }).issues.some((i) => i.key === 'hnR'), 'height limit follows the systems (12 m vs 50 m)')
}
/* 3·4. 용접 근거·簽證 대응표 */
{
  const syn = krSynthetic(DEFAULT_SPEC), cs = runConnections(DEFAULT_SPEC, syn.model, syn.loads.info, syn.results)
  const w = weldSchedule(DEFAULT_SPEC, cs)
  ok(w.some((r) => r.type === 'knee' && r.joint === 'flangeCJP' && r.demandCritical && r.standard.includes('D1.8')), 'knee flange CJP: D1.8 demand-critical candidate')
  ok(w.some((r) => r.type === 'base' && r.joint === 'flangeCJP' && r.demandCritical) === (DEFAULT_SPEC.baseFixity === 'fixed'), 'fixed base CJP demand-critical')
  ok(w.filter((r) => r.joint === 'webFillet').every((r) => (r.size ?? 0) >= 6) && w.some((r) => r.type === 'brace' && !r.demandCritical), 'web fillet sizes from connection design; brace gusset not DC')
  ok(weldSchedule(CN_DEFAULT_SPEC, cs).length === 0, 'TW only')
  ok(buildDxf({ spec: DEFAULT_SPEC, model: syn.model, connections: cs, title: 't' }).includes('AWS D1.1'), 'DXF welding note')
  const rv = reviewItems({ spec: DEFAULT_SPEC, issues: checkScope(DEFAULT_SPEC).issues, design: true, connections: true, footing: false, coldFormed: true })
  ok(rv.length === 14 && rv.find((i) => i.key === 'foundation')?.status === 'omitted' && rv.find((i) => i.key === 'seismic')?.status === 'partial' && rv.find((i) => i.key === 'member')?.status === 'included', 'review: 14 items, foundation omitted, seismic partial (site assumed)')
  const tr = reviewItems({ spec: { ...DEFAULT_SPEC, frame: 'truss' }, issues: [], design: false, connections: true, footing: true, coldFormed: false })
  ok(tr.find((i) => i.key === 'connection')?.reason === 'trussJoints' && tr.find((i) => i.key === 'member')?.status === 'omitted' && tr.find((i) => i.key === 'foundation')?.reason === 'foundationPrelim', 'review: truss joints partial, no design → omitted, footing → prelim')
}
/* 5. 냉간형강 남은 항목 */
{
  const g = ccDims('CC 150x50x20/2.3'), t = 2.3, R = t, h = 150 - 2 * (t + R)
  const wc = webCrippling(g, 245, 200)
  const N = Math.min(200, 210 * t, 2 * h)
  near(wc.Pn, 4 * t * t * 245 * (1 - 0.14) * (1 + 0.35 * Math.sqrt(N / t)) * (1 - 0.02 * Math.sqrt(h / t)) / 1e3, 1e-12, '6.5-1 EOF fastened (table 6.5-2)')
  ok(rFactor(g, 'CC', 6000) === 0.4 && rFactor(g, 'Z', 6000) === 0.5 && rFactor(g, 'CC', 11000) === null && rFactor(ccDims('CC 200x75x20/3.2'), 'CC', 6000) === null, '10.6.1 R and limits (span ≤ 10 m, d/b 2.8~4.5)')
  const sp = sectionProps('CC 150x50x20/2.3')
  const L = { Lx: 6000, Ly: 2000, Lt: 2000, Lb: 2000 }
  const a = cfCapacity('CC 150x50x20/2.3', sp, 245, 200000, L, 1, 6000), b = cfCapacity('CC 150x50x20/2.3', sp, 245, 200000, L, 1)
  ok(a.notes.some((x) => x.startsWith('CF-R10.6.1')) && Math.abs(a.phiMnxLTB - Math.min(a.phiMnxBraced, 0.9 * 0.4 * a.Se * 245 / 1e6)) < 1e-9 && b.phiMnxLTB !== a.phiMnxLTB, 'R-factor replaces LTB for free compression flange')
  near(boltBearing(12, 2.3, 400).Pn, (12 / 2.3 < 10 ? 3 : 4 - 0.1 * 12 / 2.3) * 0.75 * 12 * 2.3 * 400 / 1e3, 1e-12, '11.3-9 bearing')
  const syn = krSynthetic(DEFAULT_SPEC), d = runDesign(DEFAULT_SPEC, syn.model, syn.loads.info, syn.results)
  ok(d.members.filter((m) => m.role === 'purlin').every((m) => m.notes.some((x) => x.startsWith('CF-6.5'))), 'purlins carry the 6.5 web crippling ratio')
  const rows = d.cfDetails ?? []
  ok(['clipBearing', 'clipShear', 'sagRod', 'sagBearing'].every((k) => rows.some((r) => r.role === 'purlin' && r.item === k && r.ratio > 0 && Number.isFinite(r.ratio))), 'attachment table: clip bearing/shear, sag rod tension/bearing')
}
/* 6. 강접 내부 기둥 */
{
  const spec = normalizeSpans({ ...structuredClone(DEFAULT_SPEC), frame: 'multi' as const, spanList: [24, 24], interiorColumns: 'rigid' as const })
  const model = buildPortal(spec), gp = buildGenPayloads(spec, model), node = new Map(model.nodes.map((p) => [p.id, p]))
  const inner = model.elements.filter((e) => e.interior)
  ok(inner.length > 0 && inner.every((e) => !e.lean), 'rigid: interior columns without lean flag')
  ok(inner.every((e) => !(gp.FRLS as any)[e.id]) && inner.filter((e) => node.get(e.n1)!.z === 0).every((e) => (gp.CONS as any)[e.n1].ITEMS[0].CONSTRAINT === (spec.baseFixity === 'fixed' ? '1111111' : '1110000')), 'rigid: no top release, base per base fixity')
  const syn = krSynthetic(spec), d = runDesign(spec, syn.model, syn.loads.info, syn.results)
  const ic = d.members.filter((m) => inner.some((e) => e.id === m.id))
  ok(ic.length > 0 && ic.every((m) => m.lengths.KLx !== 8000), 'rigid interior column K from alignment chart (not K = 1)')
  ok(checkScope(spec).issues.some((i) => i.key === 'interiorRigid') && checkScope({ ...spec, code: 'CN' as const, ...CN_DEFAULT_SPEC, frame: 'multi' as const, spanList: [24, 24], span: 48, interiorColumns: 'rigid' as const }).issues.some((i) => i.key === 'interiorRigidCode'), 'scope: TW warn, others blocked')
  ok([...footingGroups(model).values()].filter((x) => x === 'lean').length === spec.bays + 1, 'footing: interior group for rigid interior columns')
  const lean = buildPortal(normalizeSpans({ ...structuredClone(DEFAULT_SPEC), frame: 'multi' as const, spanList: [24, 24] }))
  ok(lean.elements.filter((e) => e.interior).every((e) => e.lean), 'default stays leaning')
}
console.log(`TW localization: ${n} checks passed`)
