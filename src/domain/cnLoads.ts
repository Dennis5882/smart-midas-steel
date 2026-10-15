/* GB loads for a regular, single-span, closed gable factory.
   Sources: GB 55001-2021 3.1.13, GB 50009-2012 5.3/7/8;
   GB/T 50011-2010 (2024) 5.1.3–5.2.1, 5.2.5, 5.4.1.
   No Taiwan load factors, periods, amplified seismic or across-wind rules. */
import { CN } from '../codes/cn'
import { muZ, roofShape, spectrum } from '../codes/cnLateral'
import type { LoadCaseType } from '../codes'
import type { LoadInfo, LoadPayloads } from './loads'
import { portalGeometry } from './portal'
import { nodeWeights } from './weights'
import type { FactoryModel, FactorySpec, Face, Node } from './types'
import { sectionProps } from './sections'

export function validateCnSpec(spec: FactorySpec): void {
  const c = spec.china
  if (!c) throw new Error('CN project inputs are required')
  if (spec.wind.enclosure !== 'enclosed') throw new Error('GB: this factory model supports closed buildings; dominant openings require a separate pressure model')
  if (!(spec.eaveHeight > 0 && spec.eaveHeight <= 18 && spec.span > 0 && spec.span <= 60 && spec.bays >= 1 && Number.isInteger(spec.bays) && spec.baySpacing > 0 && spec.roofSlope > 0 && spec.roofSlope <= 1)) throw new Error('GB scope: regular single-storey factory, eave ≤18 m, span ≤60 m, roof slope ≤1')
  for (const k of ['w0', 'betaZ', 'topography', 'alphaMax', 'Tg', 'Tx', 'Ty', 'damping', 'snowMu', 'gamma0', 'concreteBearing', 'anchorFt'] as const)
    if (!(Number.isFinite(c[k]) && c[k] > 0)) throw new Error(`GB: invalid ${k}`)
  if (!(c.w0 >= .3 && c.betaZ >= 1 && c.topography >= .75 && c.snow >= 0 && Number.isFinite(c.snow) && c.snowMu >= .9 && c.gamma0 >= 1 && c.Tx <= 6 && c.Ty <= 6 && c.damping >= .045 && c.damping <= .05)) throw new Error('GB: check w0 ≥0.3, betaZ ≥1, topography ≥0.75, snow multiplier ≥0.9, gamma0 ≥1, periods ≤6 s, damping 0.045–0.05')
  if (spec.eaveHeight + spec.span * spec.roofSlope / 4 > 20) throw new Error('GB: mean roof height must be ≤20 m for the current local wind table')
  if (spec.bays * spec.baySpacing > 90) throw new Error('GB: the current single temperature unit is limited to 90 m')
  if (c.alphaMax >= .16 && spec.span > 24) throw new Error('GB: intensity 8/9 and span >24 m require a project-specific vertical earthquake model (GB/T 50011 5.3)')
  for (const name of Object.values(spec.sections)) { const p = sectionProps(name); if (![p.A, p.Ix, p.Iy, p.rx, p.ry].every((x) => Number.isFinite(x) && x > 0)) throw new Error(`GB: invalid section ${name}`) }
  if (spec.secondaryMaterial && spec.secondaryMaterial !== 'Q235B') throw new Error('GB/T 50018: the current cold-formed catalogue is configured for Q235B')
}

export function buildCnLoads(spec: FactorySpec, model: FactoryModel): LoadPayloads {
  validateCnSpec(spec)
  const c = spec.china!, G = portalGeometry(spec)
  const { span, eaveHeight } = spec, { length, sRoof, gWall, theta } = G
  const cos = Math.cos(theta), sin = Math.sin(theta), deg = theta * 180 / Math.PI
  const nodes = new Map(model.nodes.map((n) => [n.id, n]))
  const ends = (e: FactoryModel['elements'][number]): [Node, Node] => [nodes.get(e.n1)!, nodes.get(e.n2)!]
  const BMLD: Record<string, { ITEMS: unknown[] }> = {}, CNLD: Record<string, { ITEMS: unknown[] }> = {}
  const dead = new Map<number, number>(), snow = new Map<number, number>()
  const total: Record<string, { x: number; y: number }> = {}
  const add = (id: number, lc: string, dir: 'GX' | 'GY' | 'GZ', w: number) => {
    if (Math.abs(w) < 1e-12) return
    const items = (BMLD[id] ??= { ITEMS: [] }).ITEMS
    items.push({ ID: items.length + 1, LCNAME: lc, GROUP_NAME: '', CMD: 'BEAM', TYPE: 'UNILOAD', DIRECTION: dir, USE_PROJECTION: false, USE_ECCEN: false, D: [0, 1, 0, 0], P: [w, w, 0, 0] })
    const e = model.elements.find((x) => x.id === id)!, [a, b] = ends(e)
    const L = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)
    const t = total[lc] ??= { x: 0, y: 0 }
    if (dir === 'GX') t.x += w * L
    if (dir === 'GY') t.y += w * L
  }
  const topGirt = G.girtZs.at(-1) ?? 0
  const strip = (x: number) => Math.max(0, G.zAt(x) - topGirt - gWall / 2)
  const gable = (a: Node): 'y0' | 'yL' | null => a.y === 0 ? 'y0' : Math.abs(a.y - length) < 1e-8 ? 'yL' : null
  const qLive = CN.roofLive({ slope: spec.roofSlope, tribArea: sRoof * cos * spec.baySpacing })
  // Table 7.2.1, single-span gable: uniform and, at 20–30°, .75/1.25.
  const snowAngles = [25, 30, 35, 40, 45, 50, 55, 60], snowMus = [1, .85, .7, .55, .4, .25, .1, 0]
  const snowIndex = snowAngles.findIndex((a) => deg <= a)
  const mu = deg <= 25 ? 1 : snowIndex < 0 ? 0 : snowMus[snowIndex - 1] + (snowMus[snowIndex] - snowMus[snowIndex - 1]) * (deg - snowAngles[snowIndex - 1]) / (snowAngles[snowIndex] - snowAngles[snowIndex - 1])
  const qSnow = c.snow * mu * c.snowMu
  const snowCases = c.snow > 0 ? (deg >= 20 && deg <= 30 ? ['SN', 'SN1', 'SN2'] : ['SN']) : []
  for (const e of model.elements) {
    const [a, b] = ends(e)
    let w = 0
    if (e.role === 'girt') w = spec.wallDead * gWall
    if (e.role === 'rafter' && gable(a)) w = spec.wallDead * strip((a.x + b.x) / 2)
    if (e.role === 'purlin' || e.role === 'strut') {
      const eave = a.x === 0 || a.x === span, trib = eave ? sRoof / 2 : sRoof
      w = spec.roofDead * trib + (eave ? spec.wallDead * gWall / 2 : 0)
      add(e.id, 'LR', 'GZ', -qLive * trib * cos)
      snow.set(e.id, qSnow * trib * cos)
      for (const lc of snowCases) {
        const k = lc === 'SN' || Math.abs(a.x - span / 2) < 1e-8 ? 1 : (a.x < span / 2) === (lc === 'SN1') ? 1.25 : .75
        add(e.id, lc, 'GZ', -qSnow * trib * cos * k)
      }
    }
    if (w) { add(e.id, 'D', 'GZ', -w); dead.set(e.id, w) }
  }
  // Roof live is absent from seismic weight, snow combination value = 0.5.
  const weights = nodeWeights(spec, model, (id) => (dead.get(id) ?? 0) + .5 * (snow.get(id) ?? 0))
  const W = [...weights.values()].reduce((a, b) => a + b, 0)
  const denom = model.nodes.reduce((s, n) => s + (weights.get(n.id) ?? 0) * n.z, 0)
  const seismic = { W } as LoadInfo['seismic']
  for (const d of ['X', 'Y'] as const) {
    const T = d === 'X' ? c.Tx : c.Ty
    const sa = spectrum(T, c.alphaMax, c.Tg, c.damping), minimum = .2 * c.alphaMax
    const coef = Math.max(sa, minimum), V = coef * W
    seismic[d] = { T, c: coef, cV: sa, cStar: coef, cMin: minimum, cM: 0, gov: sa >= minimum ? 'GB/T 50011 5.1.5' : 'GB/T 50011 5.2.5', V, Fu: 1, R: 1, Mt: 0 }
    for (const n of model.nodes) {
      const F = denom > 0 ? V * (weights.get(n.id) ?? 0) * n.z / denom : 0
      if (!F) continue
      const items = (CNLD[n.id] ??= { ITEMS: [] }).ITEMS
      items.push({ ID: items.length + 1, LCNAME: `E${d}`, GROUP_NAME: '', FX: d === 'X' ? F : 0, FY: d === 'Y' ? F : 0, FZ: 0, MX: 0, MY: 0, MZ: 0 })
    }
  }
  const hRef = eaveHeight + G.rise / 2
  const q = (z: number) => c.w0 * muZ(z, c.terrain) * c.topography
  const qh = q(hRef), cp = roofShape(deg)
  const OUT: Record<Exclude<Face, 'roof'>, [number, number]> = { x0: [-1, 0], xL: [1, 0], y0: [0, -1], yL: [0, 1] }
  const winds: { name: string; dir: 'X' | 'Y'; sign: number; internal: number }[] = []
  for (const dir of ['X', 'Y'] as const) for (const sign of [1, -1]) for (const internal of [.2, -.2])
    winds.push({ name: `W${dir}${winds.filter((w) => w.dir === dir).length + 1}`, dir, sign, internal })
  for (const wc of winds) {
    const windward = wc.dir === 'X' ? (wc.sign > 0 ? 'x0' : 'xL') : (wc.sign > 0 ? 'y0' : 'yL')
    const leeward = wc.dir === 'X' ? (wc.sign > 0 ? 'xL' : 'x0') : (wc.sign > 0 ? 'yL' : 'y0')
    const wallP = (face: Exclude<Face, 'roof'>, z: number) => c.betaZ * (face === windward ? .8 * q(z) : (face === leeward ? -.5 : -.7) * qh) - wc.internal * qh
    const wall = (id: number, face: Exclude<Face, 'roof'>, z: number, trib: number) => { const p = wallP(face, z) * trib, [x, y] = OUT[face]; add(id, wc.name, 'GX', -x * p); add(id, wc.name, 'GY', -y * p) }
    for (const e of model.elements) {
      const [a, b] = ends(e)
      if (e.role === 'girt' && e.face && e.face !== 'roof') { wall(e.id, e.face, a.z, gWall); continue }
      if (e.role === 'rafter') { const face = gable(a); if (face) wall(e.id, face, (a.z + b.z) / 2, strip((a.x + b.x) / 2)); continue }
      if (e.role !== 'purlin' && e.role !== 'strut') continue
      let fx = 0, fz = 0
      const roof = (left: boolean, trib: number) => {
        const windFacing = left === (wc.sign > 0)
        const coeff = wc.dir === 'Y' ? -.6 : windFacing ? cp : -.5
        const p = qh * (c.betaZ * coeff - wc.internal)
        fx += (left ? 1 : -1) * p * trib * sin; fz -= p * trib * cos
      }
      if (a.x === 0) { roof(true, sRoof / 2); fx += wallP('x0', eaveHeight) * gWall / 2 }
      else if (a.x === span) { roof(false, sRoof / 2); fx -= wallP('xL', eaveHeight) * gWall / 2 }
      else if (Math.abs(a.x - span / 2) < 1e-8) { roof(true, sRoof / 2); roof(false, sRoof / 2) }
      else roof(a.x < span / 2, sRoof)
      add(e.id, wc.name, 'GX', fx); add(e.id, wc.name, 'GZ', fz)
    }
  }
  type Part = { lc: string; f: number }
  const variants: Record<LoadCaseType, Part[][]> = { D: [[{ lc: 'D', f: 1 }]], L: [[{ lc: 'LR', f: 1 }]], S: snowCases.length ? snowCases.map((lc) => [{ lc, f: 1 }]) : [[]], W: winds.map((w) => [{ lc: w.name, f: 1 }]), E: ['EX', 'EY'].flatMap((lc) => [1, -1].map((f) => [{ lc, f }])) }
  const LCOM: Record<string, unknown> = {}, comboKind: LoadInfo['comboKind'] = {}
  let no = 0
  for (const combo of CN.combos({ heavyLive: false })) {
    if (!snowCases.length && combo.ref === 'S') continue
    let combos: Part[][] = [[]]
    for (const [k, factor] of combo.terms) combos = combos.flatMap((parts) => variants[k].map((v) => [...parts, ...v.map((p) => ({ lc: p.lc, f: p.f * factor }))]))
    const seen = new Set<string>()
    for (const parts of combos) {
      const key = JSON.stringify(parts); if (seen.has(key)) continue; seen.add(key)
      const suffix = parts.filter((p) => !['D', 'LR'].includes(p.lc)).map((p) => `${p.f < 0 ? '-' : ''}${p.lc}`).join(' ')
      const name = `GB ${combo.ref}${suffix ? ` ${suffix}` : ''}`
      comboKind[name] = 'basic'
      // Structural importance gamma0 is applied to non-seismic combinations.
      const gamma = parts.some((p) => p.lc.startsWith('E')) ? 1 : c.gamma0
      LCOM[++no] = { NAME: name, ACTIVE: 'ACTIVE', iTYPE: 0, DESC: 'GB 55001 / GB 50009 / GB/T 50011', vCOMB: parts.map((p) => ({ ANAL: 'ST', LCNAME: p.lc, FACTOR: p.f * gamma })) }
    }
  }
  const STLD: Record<string, unknown> = {}
  const cases = [['D', 'D'], ['LR', 'LR'], ...snowCases.map((n) => [n, 'S']), ['EX', 'E'], ['EY', 'E'], ...winds.map((w) => [w.name, 'W'])]
  cases.forEach(([NAME, TYPE], i) => { STLD[i + 1] = { NAME, TYPE, DESC: `GB ${NAME}` } })
  return { STLD, BODF: { 1: { LCNAME: 'D', GROUP_NAME: '', FV: [0, 0, -1] } }, BMLD, CNLD, 'LCOM-GEN': LCOM,
    info: { roofLive: qLive, snow: qSnow, seismic, comboKind, omega: { X: 1, Y: 1 }, wind: { qh, hRef, cases: winds.map((w) => ({ name: w.name, dir: w.dir, roofCp: w.dir === 'X' ? cp : -.6, gcpi: w.internal })), windwardRoofCp: { low: cp, high: cp }, across: { WDx: Math.max(...winds.filter((w) => w.dir === 'X').map((w) => Math.abs(total[w.name]?.x ?? 0))), WDy: Math.max(...winds.filter((w) => w.dir === 'Y').map((w) => Math.abs(total[w.name]?.y ?? 0))), WLX: 0, WLY: 0, MT: 0, kD: 1 }, variants: winds.map((w) => ({ tag: w.name, dir: w.dir, parts: [{ lc: w.name, f: 1 }] })) } } }
}
