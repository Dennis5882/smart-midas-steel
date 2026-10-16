/* GB 50009-2012 tables 8.3.3 and 8.6.1, closed buildings.
   No tributary-area reduction is credited (8.3.4). Each member receives
   the worst zone it intersects over its whole length. */
import { muZ } from '../codes/cnLateral'
import { portalGeometry } from './portal'
import { sectionProps } from './sections'
import type { FactoryModel, FactorySpec } from './types'
import type { LoadInfo } from './loads'
import type { CCLoad } from './secondary'

export function cnGust(z: number, terrain: string): number {
  const rows: Record<string, number[]> = { A: [1.65, 1.60, 1.57, 1.55], B: [1.70, 1.70, 1.66, 1.63], C: [2.05, 2.05, 2.05, 1.99], D: [2.40, 2.40, 2.40, 2.40] }
  const a = rows[terrain]
  if (!a || z > 20) throw new Error('GB local wind: current low-rise table supports z ≤20 m')
  if (z <= 5) return a[0]
  const i = Math.min(3, Math.ceil((z - 5) / 5))
  return a[i - 1] + (a[i] - a[i - 1]) * (z - i * 5) / 5
}
function interp(deg: number, v: number[]): number {
  const x = [5, 15, 30, 45]
  if (deg <= 5) return v[0]
  if (deg >= 45) return v[3]
  const i = x.findIndex((n) => deg <= n)
  return v[i - 1] + (v[i] - v[i - 1]) * (deg - x[i - 1]) / (x[i] - x[i - 1])
}
export function cnCCLoads(spec: FactorySpec, model: FactoryModel, info: LoadInfo): Map<number, CCLoad> {
  const c = spec.china!, G = portalGeometry(spec), out = new Map<number, CCLoad>()
  const nodes = new Map(model.nodes.map((n) => [n.id, n]))
  const h = info.wind.hRef, deg = G.theta * 180 / Math.PI, E = Math.min(2 * h, spec.span, G.length), a = E / 5
  const q = c.w0 * c.topography * muZ(h, c.terrain) * cnGust(h, c.terrain)
  for (const e of model.elements) {
    if (e.role !== 'purlin' && e.role !== 'girt') continue
    const n1 = nodes.get(e.n1)!, n2 = nodes.get(e.n2)!, sp = sectionProps(e.section)
    const L = Math.hypot(n2.x - n1.x, n2.y - n1.y, n2.z - n1.z)
    const end = Math.min(n1.y, n2.y) <= a || Math.max(n1.y, n2.y) >= G.length - a
    const edge = G.nearEave(n1.x, E / 10) || G.nearRidge(n1.x, E / 10)
    const zone = e.role === 'girt' ? (end ? 5 : 4) : end && edge ? 3 : end || edge ? 2 : 1
    let pos: number, neg: number
    if (e.role === 'girt') { pos = 1; neg = zone === 5 ? -1.4 : -1 }
    else {
      pos = interp(deg, [0, .2, .7, .7])
      const cornerNeg = interp(deg, [-2, -2, -1.5, 0]) // H/D≥1 envelope, conservative for lower buildings
      const edgeNeg = Math.min(interp(deg, [-1.8, -1.5, -1.5, 0]), interp(deg, [-.6, -1.5, -.5, -.3]))
      neg = zone === 3 ? cornerNeg : zone === 2 ? edgeNeg : Math.min(interp(deg, [-1.2, -.6, -.3, 0]), interp(deg, [-.6, -.4, -.4, -.2]))
      if (end) neg = Math.min(neg, -1.8) // longitudinal wind, near gable Ra/Rb at α≤5°
    }
    const pPos = q * (pos + .2), pNeg = q * (neg - .2), trib = e.role === 'purlin' ? G.sRoof : G.gWall
    const self = 78.5 * sp.A * 1e-6, D = (e.role === 'purlin' ? spec.roofDead : spec.wallDead) * trib + self
    const normalD = e.role === 'purlin' ? D * Math.cos(G.theta) : 0
    const S = e.role === 'purlin' ? (info.snow ?? 0) * trib * Math.cos(G.theta) ** 2 * (deg >= 20 && deg <= 30 ? 1.25 : 1) : 0
    const wt = e.role === 'purlin' ? (1.3 * D + 1.05 * (info.snow ?? 0) * trib * Math.cos(G.theta)) * Math.sin(G.theta) : 1.3 * D
    const My = wt * (L / (spec.sagRods + 1)) ** 2 / 8
    const demand = (combo: string, w: number) => ({ combo, f: { P: 0, Mx: c.gamma0 * Math.abs(w) * L ** 2 / 8, My: c.gamma0 * My, V: c.gamma0 * Math.abs(w) * L / 2 }, braced: false })
    out.set(e.id, { zone, A: L * trib, pPos, pNeg, demands: [demand(`GB C&C+ z${zone}`, 1.3 * normalD + 1.05 * S + 1.5 * pPos * trib), demand(`GB C&C- z${zone}`, normalD + 1.5 * pNeg * trib)] })
  }
  return out
}
