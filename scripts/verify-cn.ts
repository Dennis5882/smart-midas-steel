import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CN, cnStrength } from '../src/codes/cn'
import { muZ, spectrum, effectiveWidth, roofShape } from '../src/codes/cnLateral'
import { bucklingPhi, cnCapacity, cnCheck } from '../src/codes/cnSteel'
import { coldPhi } from '../src/codes/cnColdTable'
import { CN_DEFAULT_SPEC, DEFAULT_SPEC } from '../src/domain/types'
import { buildPortal } from '../src/domain/portal'
import { buildGenPayloads } from '../src/domain/gen'
import { buildLoadPayloads } from '../src/domain/loads'
import { sectionProps } from '../src/domain/sections'
import { CN_CATALOG } from '../src/domain/cnCatalog'
import { frictionBolt, tensileArea } from '../src/domain/cnConnections'
import { validateCnSpec } from '../src/domain/cnLoads'

const near = (a: number, b: number, tol = 1e-8) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b}`)
// Independent tabulated anchors: GB 50017 table 4.4.1, D.0.1/D.0.2.
assert.deepEqual(cnStrength('Q235B', 16), { fy: 235, f: 215, fv: 125, fu: 370 })
assert.equal(cnStrength('Q235B', 16.01).f, 205)
assert.equal(cnStrength('Q345B', 40).f, 295)
assert.equal(cnStrength('Q345B', 40.01).f, 290)
near(bucklingPhi(100, 235, 206000, 'a'), .637, .001)
near(bucklingPhi(100, 235, 206000, 'b'), .555, .001)
near(bucklingPhi(50, 235, 206000, 'b'), .856, .001)
near(coldPhi(100), .588); near(coldPhi(150), .308)
near(muZ(10, 'A'), 1.28); near(muZ(10, 'B'), 1); near(muZ(20, 'C'), .74)
near(spectrum(.1, .08, .35, .05), .08)
near(spectrum(.35, .08, .35, .05), .08)
near(spectrum(1.75, .08, .35, .05), .08 * .2 ** .9)
near(roofShape(15), -.6); near(roofShape(60), .8)
assert.ok(effectiveWidth(200, 2, 205, 4) < effectiveWidth(200, 3, 205, 4))
near(frictionBolt(24).tension, 180); near(frictionBolt(24).shear, 81)
assert.ok(tensileArea(24) > 350 && tensileArea(24) < 355)
const unbraced = cnCapacity(sectionProps('HN 300x150x6.5/9'), 'Q235B', { KLx: 6000, KLy: 6000, Lb: 6000 })
assert.ok(unbraced.phiMnx < unbraced.elasticX)
assert.ok(cnCheck(unbraced, { P: 0, Mx: unbraced.phiMnx, My: 0, V: 0 }).ratio >= 1)
const spec = structuredClone(CN_DEFAULT_SPEC), model = buildPortal(spec)
const gen = buildGenPayloads(spec, model), loads = buildLoadPayloads(spec, model)
const node = new Map(model.nodes.map((n) => [n.id, n]))
const totals: Record<string, number[]> = {}
for (const [id, record] of Object.entries(loads.BMLD)) {
  const e = model.elements.find((x) => x.id === +id)!, a = node.get(e.n1)!, b = node.get(e.n2)!
  const L = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)
  for (const p of (record as { ITEMS: any[] }).ITEMS) { const out = totals[p.LCNAME] ??= [0, 0, 0]; out[['GX', 'GY', 'GZ'].indexOf(p.DIRECTION)] += p.P[0] * L }
}
near(-totals.LR[2], .5 * 24 * 36, .0001)
near(-totals.SN[2], .3 * 24 * 36, .0001)
for (const lc of ['EX', 'EY']) {
  const d = lc === 'EX' ? 0 : 1, sum = Object.values(loads.CNLD).reduce((s, r: any) => s + r.ITEMS.filter((x: any) => x.LCNAME === lc).reduce((a: number, x: any) => a + (d ? x.FY : x.FX), 0), 0)
  near(sum, loads.info.seismic[d ? 'Y' : 'X'].V, .0001)
}
const cases = new Set(Object.values(loads.STLD).map((x: any) => x.NAME))
assert.ok(!cases.has('WLX') && !cases.has('ETX'))
for (const cb of Object.values(loads['LCOM-GEN']) as any[]) {
  assert.ok(cb.NAME.startsWith('GB '))
  for (const p of cb.vCOMB) assert.ok(cases.has(p.LCNAME), p.LCNAME)
  if (cb.vCOMB.some((x: any) => x.LCNAME.startsWith('E'))) for (const p of cb.vCOMB.filter((x: any) => x.LCNAME.startsWith('E'))) near(Math.abs(p.FACTOR), 1.4)
}
for (const list of Object.values(CN_CATALOG)) for (const name of list) {
  const s = sectionProps(name); assert.ok(s.A > 0 && Number.isFinite(s.Ix) && s.Ix > 0, name)
}
for (const x of Object.values(gen.SECT) as any[]) assert.equal(x.SECT_BEFORE.SECT_I.DB_NAME, CN.gen.sectionDbOf!(x.SECT_BEFORE.SECT_I.SECT_NAME))
for (const e of model.elements) assert.equal((gen.ELEM[e.id] as any).MATL, ['purlin', 'girt'].includes(e.role) ? 2 : 1)
const twModel = buildPortal(DEFAULT_SPEC), tw = buildLoadPayloads(DEFAULT_SPEC, twModel)
// Country-specific bracing must not silently move the Taiwan frame bracing.
const wallBays = (m: typeof model) => [...new Set(m.elements.filter((e) => e.role === 'brace' && e.face !== 'roof').map((e) => Math.min(...[e.n1, e.n2].map((id) => m.nodes.find((n) => n.id === id)!.y)) / 6))].sort()
assert.deepEqual(wallBays(model), [2])
assert.deepEqual(wallBays(twModel), [1, 4])
assert.throws(() => validateCnSpec({ ...spec, span: 30, china: { ...spec.china!, alphaMax: .16 } }), /vertical earthquake/)
assert.throws(() => validateCnSpec({ ...spec, bays: 16 }), /90 m/)
assert.throws(() => validateCnSpec({ ...spec, wind: { ...spec.wind, enclosure: 'partial' } }), /closed buildings/)
const steepSnow = buildLoadPayloads({ ...spec, roofSlope: Math.tan(37 * Math.PI / 180) }, buildPortal({ ...spec, roofSlope: Math.tan(37 * Math.PI / 180) }))
near(steepSnow.info.snow!, .3 * .64)
const uneven = buildLoadPayloads({ ...spec, roofSlope: Math.tan(25 * Math.PI / 180) }, buildPortal({ ...spec, roofSlope: Math.tan(25 * Math.PI / 180) }))
assert.ok(Object.values(uneven.STLD).some((x: any) => x.NAME === 'SN1'))
assert.ok(Object.values(uneven.STLD).some((x: any) => x.NAME === 'SN2'))
assert.equal(Object.keys(tw.STLD).length, 15)
assert.equal(Object.keys(tw['LCOM-GEN']).length, 55)
assert.ok(Object.values(tw['LCOM-GEN']).every((x: any) => x.NAME.startsWith('LRFD')))
const path = join(tmpdir(), 'smart-midas-cn-live.json')
writeFileSync(path, JSON.stringify({ spec, model, gen, loads, totals }))
console.log(JSON.stringify({ checks: 'passed', nodes: model.nodes.length, elements: model.elements.length, cases: cases.size, combos: Object.keys(loads['LCOM-GEN']).length, LR: -totals.LR[2], snow: -totals.SN[2], fixture: path }, null, 2))
