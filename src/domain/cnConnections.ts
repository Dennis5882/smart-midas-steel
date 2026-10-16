/* GB connection sizing for the supported portal factory.
   GB 50017-2017 11.2, 11.4.2, 12.7; GB/T 50011 9.2.7.
   10.9 friction bolts: standard holes, one blasted friction surface (mu=.40).
   Exposed base: anchors take tension; friction + a designed shear key take V.
   Plate sizing uses elastic cantilever mechanics, no AISC yield-line factors.
   Foundation breakout, anchor development and rotation qualification remain
   explicit detailing checks, not calculated resistance in these results. */
import { cnStrength } from '../codes/cn'
import type { Results } from '../actions/results'
import type { FactorySpec, FactoryModel } from './types'
import type { ConnCheck, ConnResult, ConnectionParts } from './connections'
import { sectionProps } from './sections'
import { portalGeometry } from './portal'

const PLATES = [10, 12, 14, 16, 18, 20, 22, 25, 28, 30, 32, 36, 40, 45, 50, 55, 60, 65, 70, 80, 90, 100]
// Stop at the verified material-table range; an undersized 100 mm plate stays NG.
const pick = (x: number) => PLATES.find((n) => n >= x) ?? 100
const pitch: Record<number, number> = { 20: 2.5, 22: 2.5, 24: 3, 27: 3, 30: 3.5, 36: 4, 42: 4.5, 48: 5, 56: 5.5, 64: 6 }
export const tensileArea = (d: number) => Math.PI / 4 * (d - .9382 * (pitch[d] ?? 3)) ** 2
const pre: Record<number, number> = { 20: 155, 22: 190, 24: 225, 27: 290, 30: 355 }
export function frictionBolt(d: number) { if (!pre[d]) throw new Error('GB bolt diameter unsupported'); return { tension: .8 * pre[d], shear: .9 * .4 * pre[d] } }
function check(item: string, demand: number, capacity: number, unit: string, clause: string): ConnCheck { return { item, demand, capacity, unit, clause, ratio: capacity > 0 ? demand / capacity : 99 } }
const ratio = (cs: ConnCheck[]) => Math.max(0, ...cs.map((x) => x.ratio))
interface Force { elem: number; combo: string; P: number; M: number; V: number }
const endpoints = (res: Results, id: number, part: number): Force[] => [...res.beam.get(id) ?? []].map(([combo, p]) => ({ elem: id, combo, P: p[part].P, M: Math.abs(p[part].My), V: Math.hypot(p[part].Vy, p[part].Vz) }))
export function runCnConnections(spec: FactorySpec, model: FactoryModel, res: Results): ConnResult[] {
  const out: ConnResult[] = [], c = spec.china!, nodes = new Map(model.nodes.map((n) => [n.id, n])), G = portalGeometry(spec)
  const col = sectionProps(spec.sections.column), raf = sectionProps(spec.sections.rafter)
  const plateF = (t: number) => cnStrength(spec.material, t).f
  const weldF = spec.material === 'Q235B' ? 160 : 200 // E43 / E50, GB table 4.4.5
  const baseForces = model.elements.filter((e) => e.role === 'column' && nodes.get(e.n1)!.z === 0).flatMap((e) => endpoints(res, e.id, 0))
  if (!baseForces.length) throw new Error('GB connections: no column-base forces')
  let selected: ConnResult | undefined
  for (const d of [24, 30, 36, 42, 48, 56, 64]) {
    const nSide = 4, edge = Math.max(60, 2 * d), N = Math.max(col.d + 300, 2 * edge + 200), B = Math.max(col.bf + 300, 3 * 3 * d + 2 * edge)
    const z = N - edge - 50, strip = 100
    let tReq = 0, maxV = 0, maxKey = 0, worstF = baseForces[0], checks: ConnCheck[] = []
    for (const f of baseForces) {
      const T = (spec.baseFixity === 'fixed' ? f.M * 1000 / z : 0) + Math.max(0, f.P)
      const compression = Math.max(0, -f.P) + T, q = compression * 1000 / (B * strip)
      const t = (N - col.d) / 2 * Math.sqrt(3 * q / plateF(100))
      const ta = tensileArea(d) * c.anchorFt / 1000
      const cs = [check('bearing', q, c.concreteBearing, 'MPa', 'GB 50017 12.7.5; specified concrete design stress'), check('anchorT', T / nSide, ta, 'kN', 'GB 50017 11.4.1-6 / table 4.4.6')]
      if (!checks.length || ratio(cs) > ratio(checks)) { checks = cs; worstF = f }
      tReq = Math.max(tReq, t, Math.sqrt(6 * T * 1000 * Math.max(30, edge - 50) / (B * plateF(100))))
      maxV = Math.max(maxV, f.V); maxKey = Math.max(maxKey, Math.max(0, f.V - .4 * Math.max(0, -f.P)))
    }
    const tp = pick(Math.max(16, tReq)), keyW = Math.max(200, Math.ceil(maxKey * 1000 / (100 * c.concreteBearing) / 10) * 10), keyT = pick(Math.max(10, maxKey * 1000 / (100 * cnStrength(spec.material, 16).fv)))
    const w = Math.max(6, Math.ceil(maxV * 1000 / (.7 * weldF * 2 * col.h)))
    checks.push(check('plateT', tReq, tp, 'mm', 'GB 50017 12.7.5, elastic cantilever'), check('shearKey', maxKey, Math.min(100 * keyT * cnStrength(spec.material, keyT).fv, keyW * 100 * c.concreteBearing) / 1000, 'kN', 'GB 50017 12.7.4'), check('weldWeb', maxV, .7 * w * 2 * col.h * weldF / 1000, 'kN', 'GB 50017 11.2.2'))
    selected = { type: 'base', elem: worstF.elem, combo: worstF.combo, dims: { plate: `PL ${B}x${N}x${tp}`, anchors: `${2 * nSide}-M${d} Q235/Q345, ft=${c.anchorFt} MPa`, anchorLayout: `${nSide}/side; edge ${edge} mm`, shearKey: `PL ${keyW}x100x${keyT}; embedded 100 mm`, weld: `web ${w} mm; flanges CJP` }, checks, ratio: ratio(checks), notes: ['gbFoundation'] }
    selected.parts = { plates: [{ part: 'plate', width: B, length: N, thickness: tp, count: 1, estimated: false }, { part: 'shearKey', width: keyW, length: 100, thickness: keyT, count: 1, estimated: false }], fasteners: [{ kind: 'anchor', diameter: d, count: 2 * nSide }] }
    if (selected.ratio <= 1) break
  }
  out.push(selected!)
  for (const type of (G.ridges.length ? ['knee', 'apex'] : ['knee']) as ('knee' | 'apex')[]) {
    const at = type === 'knee' ? G.isEaveNode : G.isRidgeNode
    const els = model.elements.filter((e) => e.role === 'rafter' && (at(nodes.get(e.n1)!) || at(nodes.get(e.n2)!)))
    const fs = els.flatMap((e) => endpoints(res, e.id, at(nodes.get(e.n1)!) ? 0 : 4))
    if (!fs.length) throw new Error(`GB connections: no ${type} forces`)
    const capacityMoment = 1.2 * raf.Zx * cnStrength(spec.material, raf.tf).fy / 1e6
    if (type === 'knee') fs.push({ elem: fs[0].elem, combo: 'GB capacity envelope 1.2Mp', P: Math.max(0, ...fs.map((f) => f.P)), M: capacityMoment, V: Math.max(...fs.map((f) => f.V)) })
    let result: ConnResult | undefined
    boltSearch: for (const d of [20, 22, 24, 27, 30]) for (const count of [8, 12, 16, 20, 24, 28, 32]) {
      const b = frictionBolt(d), nT = count / 2, pf = Math.max(50, 2 * d), bp = Math.max(raf.bf + 100, 6 * d), z = raf.d - raf.tf
      let checks: ConnCheck[] = [], worstF = fs[0], maxPlate = 0, maxFlange = 0, maxV = 0
      for (const f of fs) {
        const flange = f.M * 1000 / z + Math.max(0, f.P) / 2
        const T = 2 * flange / nT, V = f.V / count // factor 2 includes conservative prying envelope
        const cs = [check('boltT', T, b.tension, 'kN', 'GB 50017 11.4.2-2'), check('boltV', V, b.shear, 'kN', 'GB 50017 11.4.2-1'), check('boltTV', T / b.tension + V / b.shear, 1, '-', 'GB 50017 11.4.2-3')]
        if (!checks.length || ratio(cs) > ratio(checks)) { checks = cs; worstF = f }
        maxPlate = Math.max(maxPlate, Math.sqrt(6 * flange * 1000 * pf / (bp * plateF(100))))
        maxFlange = Math.max(maxFlange, flange); maxV = Math.max(maxV, f.V)
      }
      const tp = pick(Math.max(16, maxPlate)), w = Math.max(6, Math.ceil(maxV * 1000 / (.7 * 2 * raf.h * weldF)))
      checks.push(check('plateT', maxPlate, tp, 'mm', 'GB 50017 12.3, elastic cantilever'), check('weldWeb', maxV, .7 * w * 2 * raf.h * weldF / 1000, 'kN', 'GB 50017 11.2.2'))
      const dims: ConnResult['dims'] = { plate: `PL ${bp}x${Math.max(raf.d + 4 * pf, (count / 2 - 1) * 3 * d + 4 * d)}x${tp}`, bolts: `${count}-M${d} 10.9 friction, mu=0.40`, pitch: `${3 * d} mm minimum, edge ${2 * d} mm`, weld: `web ${w} mm; flanges CJP` }
      const parts: ConnectionParts = { plates: [{ part: 'plate', width: bp, length: Math.max(raf.d + 4 * pf, (count / 2 - 1) * 3 * d + 4 * d), thickness: tp, count: type === 'apex' ? 2 : 1, estimated: false }], fasteners: [{ kind: 'bolt', diameter: d, count }] }
      if (type === 'knee') {
        const doubler = pick(Math.max(0, maxFlange * 1000 / (col.h * cnStrength(spec.material, 100).fv) - col.tw))
        const stiffWidth = (col.bf - col.tw) / 2, stiffT = pick(Math.max(col.tf, maxFlange * 1000 / (2 * stiffWidth * plateF(100)), stiffWidth / 13))
        dims.doubler = `PL ${doubler}`; dims.stiffener = `2-PL ${stiffWidth}x${stiffT}`
        parts.plates.push({ part: 'doubler', width: col.h, length: raf.d, thickness: doubler, count: 1, estimated: true }, { part: 'stiffener', width: stiffWidth, length: col.h, thickness: stiffT, count: 2, estimated: true })
        checks.push(check('panel', maxFlange, col.h * (col.tw + doubler) * cnStrength(spec.material, Math.max(col.tw, doubler)).fv / 1000, 'kN', 'GB 50017 12.3; web shear equilibrium'), check('stiffener', maxFlange, 2 * stiffWidth * stiffT * plateF(stiffT) / 1000, 'kN', 'GB 50017 12.3, flange-force continuity'))
      }
      result = { type, elem: worstF.elem, combo: worstF.combo, dims, checks, ratio: ratio(checks), notes: ['gbJointDetail'], parts }
      if (result.ratio <= 1) break boltSearch
    }
    out.push(result!)
  }
  let force = 0, elem = 0, combo = ''
  const brace = sectionProps(spec.sections.brace)
  const yieldForce = brace.A * cnStrength(spec.material, brace.tw, true).fy / 1000
  for (const [id, m] of res.truss) for (const [lc, p] of m) if (Math.abs(p) > force) { force = Math.abs(p); elem = id; combo = lc }
  if (elem) {
    const N = Math.max(force, 1.1 * yieldForce), d = 24, b = frictionBolt(d), n = Math.max(2, Math.ceil(N / b.shear))
    const width = Math.max(200, 4 * d), net = width - (d + 2)
    const t = pick(Math.max(10, N * 1000 / (net * plateF(100))))
    const checks = [check('boltV', N / n, b.shear, 'kN', 'GB 50017 11.4.2-1'), check('bearingPl', N, net * t * plateF(t) / 1000, 'kN', 'GB 50017 7.1.1 (net section)')]
    out.push({ type: 'brace', elem, combo: force >= 1.1 * yieldForce ? combo : 'GB brace capacity envelope 1.1FyAg', dims: { bolts: `${n}-M${d} 10.9 friction mu=.40`, gusset: `PL ${width}x${t}`, pitch: `${3 * d} mm; edge ${2 * d} mm` }, checks, ratio: ratio(checks), notes: ['gbBraceDetail'], parts: { plates: [{ part: 'gusset', width, length: width, thickness: t, count: 1, estimated: true }], fasteners: [{ kind: 'bolt', diameter: d, count: n }] } })
  }
  return out
}
