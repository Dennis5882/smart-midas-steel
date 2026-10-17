import { profileOf } from '../codes'
import { portalGeometry } from './portal'
import { sectionProps } from './sections'
import { sectionCatalogOptions } from './sectionCatalog'
import { baySpans, type Element, type FactoryModel, type FactorySpec } from './types'
import type { AdditionModel, FactoryAdditions, PlatformOptions } from './additionTypes'

export const activeCrane = (s: FactorySpec) => s.features?.crane ? s.additions?.crane : undefined
export const activePlatform = (s: FactorySpec) => s.features?.mezzanine ? s.additions?.platform : undefined
export const hasAdditions = (s: FactorySpec) => !!(s.additions?.equipment.length || activeCrane(s) || activePlatform(s))
export function defaultAdditions(s: FactorySpec): FactoryAdditions {
  return { equipment: [], factors: { dead: s.code === 'CN' ? 1.3 : 1.2, live: s.code === 'TW' ? 1.6 : 1.5, accompanyingLive: .5, crane: s.code === 'TW' ? 1.6 : 1.5, source: '', confirmed: false } }
}
export function defaultPlatform(s: FactorySpec): PlatformOptions {
  return { id: 'platform-1', kind: 'mezzanine', elevation: Math.min(4, s.eaveHeight / 2), x0: 0, x1: s.span, firstBay: 0, lastBay: Math.min(s.bays, 2), beamSpacing: 2,
    beamSection: s.sections.rafter, columnSection: s.sections.column, dead: 1, live: 2, liveMassFraction: 0, deflectionDivisor: 360, source: '', confirmed: false }
}
export function bayStations(s: FactorySpec): number[] { return baySpans(s).reduce<number[]>((a, v) => [...a, a[a.length - 1] + v], [0]) }
const finite = (...v: number[]) => v.every(Number.isFinite)
const inRange = (n: number, lo: number, hi: number) => Number.isFinite(n) && n >= lo && n <= hi
export interface AdditionError { path: string; key: 'add_invalid_equipment' | 'add_invalid_crane' | 'add_invalid_platform' | 'add_invalid_factors'; name: string }
export function additionErrors(s: FactorySpec, requireConfirmation = true): AdditionError[] {
  const out: AdditionError[] = [], a = s.additions, length = bayStations(s).at(-1)!, G = portalGeometry(s)
  const confirmed = (x: { source: string; confirmed: boolean }) => !requireConfirmation || (x.confirmed && !!x.source.trim())
  const ids = new Set<string>()
  for (const e of a?.equipment ?? []) {
    if (!e.id || ids.has(e.id) || !e.name.trim() || !inRange(e.x, 0, s.span) || !inRange(e.y, 0, length) || !(e.weight > 0 && e.weight <= 1e6) || !inRange(e.seismicFraction, 0, 1) || !confirmed(e)) out.push({ path: 'equipment', key: 'add_invalid_equipment', name: e.name || e.id })
    ids.add(e.id)
  }
  const c = activeCrane(s)
  if (c && (!c.id || ids.has(c.id))) out.push({path:'crane',key:'add_invalid_crane',name:c.id})
  if (c) ids.add(c.id)
  if (s.features?.crane && (!c || !finite(c.elevation, c.eccentricity, c.wheelSpacing, c.maxWheel, c.minWheel, c.impactFactor, c.lateral, c.braking, c.seismicWeight)
    || !(c.elevation > 0 && c.elevation < Math.min(...G.eaveXs.map(G.zAt)) && c.eccentricity >= 0 && c.eccentricity < s.span / 4 && c.wheelSpacing > 0 && c.wheelSpacing < length && c.maxWheel > 0 && c.minWheel >= 0 && c.maxWheel >= c.minWheel && c.impactFactor >= 1 && c.impactFactor <= 3 && c.lateral >= 0 && c.braking >= 0 && c.seismicWeight >= 0)
    || !(c.driftLimitMm > 0 && Number.isFinite(c.driftLimitMm)) || !confirmed(c) || s.bays > 8)) out.push({ path: 'crane', key: 'add_invalid_crane', name: c?.id ?? 'crane' })
  const p = activePlatform(s)
  if (p && (!p.id || ids.has(p.id))) out.push({path:'platform',key:'add_invalid_platform',name:p.id})
  let sectionsOK = false
  if (p) try { sectionsOK = ([['rafter',p.beamSection],['column',p.columnSection]] as const).every(([role,n]) => { const v = sectionProps(n); return sectionCatalogOptions(s.code,role,s.material).some((r)=>r.name===n) && v.kind === 'H' && [v.A, v.Ix, v.Iy, v.d, v.bf, v.tw, v.tf].every((x) => x > 0 && Number.isFinite(x)) }) } catch { /* invalid input */ }
  if (s.features?.mezzanine && (!p || !finite(p.elevation, p.x0, p.x1, p.firstBay, p.lastBay, p.beamSpacing, p.dead, p.live, p.liveMassFraction)
    || !(p.elevation > 0 && p.elevation < Math.min(...G.eaveXs.map(G.zAt)) && p.x0 >= 0 && p.x1 <= s.span && p.x1 - p.x0 >= .5 && p.beamSpacing >= .5 && (p.x1 - p.x0) / p.beamSpacing <= 40 && Number.isInteger(p.firstBay) && Number.isInteger(p.lastBay) && p.firstBay >= 0 && p.lastBay <= s.bays && p.lastBay > p.firstBay && p.dead >= 0 && p.live > 0 && inRange(p.liveMassFraction, 0, 1))
    || !(p.deflectionDivisor >= 100 && Number.isFinite(p.deflectionDivisor)) || !sectionsOK || !confirmed(p) || (c && Math.abs(p.elevation - c.elevation) < .5))) out.push({ path: 'platform', key: 'add_invalid_platform', name: p?.id ?? 'platform' })
  if ((c || p) && (!a || ![a.factors.dead, a.factors.live, a.factors.accompanyingLive, a.factors.crane].every((v) => finite(v) && v >= 0 && v <= 3) || a.factors.dead < 1 || a.factors.live < 1 || (c && a.factors.crane < 1) || !confirmed(a.factors))) out.push({ path: 'factors', key: 'add_invalid_factors', name: '' })
  return out
}

/** For roof/wall loads and base connections; added members never inherit roof load rules. */
export function factoryOnly(m: FactoryModel, allNodes = true): FactoryModel {
  if (!m.additions) return m
  const elements = m.elements.filter((e) => !e.addition), used = new Set(elements.flatMap((e) => [e.n1, e.n2]))
  return { ...m, elements, nodes: allNodes ? m.nodes : m.nodes.filter((n) => used.has(n.id)) }
}

/** Apply deterministic geometry and keep physical members intact across analysis-element splits. */
export function applyAdditions(s: FactorySpec, base: FactoryModel): FactoryModel {
  if (!hasAdditions(s)) return base
  const errors = additionErrors(s, false)
  if (errors.length) throw new Error(`Addition geometry/input: ${errors.map((e) => e.path).join(', ')}`)
  const nodes = base.nodes.map((n) => ({ ...n })), elements = base.elements.map((e) => ({ ...e })), G = portalGeometry(s), ys = bayStations(s)
  const coord = (x: number, y: number, z: number) => [x, y, z].map((v) => v.toFixed(7)).join('|')
  const map = new Map(nodes.map((n) => [coord(n.x, n.y, n.z), n.id]))
  const byId = (id: number) => nodes[id - 1]
  const node = (x: number, y: number, z: number) => { const key = coord(x, y, z); let id = map.get(key); if (!id) { id = nodes.length + 1; map.set(key, id); nodes.push({ id, x, y, z }) }; return id }
  for (const e of elements) {
    const a = byId(e.n1), b = byId(e.n2)
    e.designLength = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)
    e.physicalKey = e.role === 'column' || e.role === 'post' ? `${e.role}:${coord(a.x, a.y, 0)}`
      : e.role === 'rafter' ? `rafter:${a.y.toFixed(7)}:${G.planes.findIndex((p) => (a.x + b.x) / 2 >= p.xa - 1e-7 && (a.x + b.x) / 2 <= p.xb + 1e-7)}`
      : `${e.role}:${[coord(a.x, a.y, a.z), coord(b.x, b.y, b.z)].sort().join('~')}`
  }
  const meta: AdditionModel = { members: [], nodal: [], beam: [], seismicWeights: [], fixedBases: [], craneCases: [], sources: [] }
  const beamLoads: { member: Element; case: string; source: string; q: number }[] = []
  const addMember = (n1: number, n2: number, section: string, usage: 'platform-beam' | 'platform-column', key: string, sourceId: string) => {
    const e: Element = { id: 0, n1, n2, role: usage === 'platform-beam' ? 'strut' : 'post', section, addition: usage, physicalKey: key, sourceId }; elements.push(e); return e
  }
  const splitColumn = (x: number, y: number, z: number) => {
    const id = node(x, y, z)
    const i = elements.findIndex((e) => !e.addition && (e.role === 'column' || e.role === 'post') && Math.abs(byId(e.n1).x - x) < 1e-7 && Math.abs(byId(e.n1).y - y) < 1e-7 && byId(e.n1).z < z - 1e-7 && byId(e.n2).z > z + 1e-7)
    if (i >= 0) { const e = elements[i]; elements.splice(i, 1, { ...e, n2: id }, { ...e, n1: id }) }
    return id
  }
  const nodal = (id: number, lc: string, source: string, fz: number, fx = 0, fy = 0, my = 0, mz = 0) => meta.nodal.push({ node: id, case: lc, source, fx, fy, fz, mx: 0, my, mz })
  const weight = (id: number, w: number, source: string) => { if (w) meta.seismicWeights.push({ node: id, weight: w, source }) }
  const bracket = (list: number[], v: number) => { const i = Math.max(0, Math.min(list.length - 2, list.findIndex((x) => x >= v - 1e-9) - 1)); const j = v >= list.at(-1)! - 1e-9 ? list.length - 2 : i; const f = (v - list[j]) / (list[j + 1] - list[j]); return [[list[j], 1 - f], [list[j + 1], f]] }
  for (const e of s.additions?.equipment ?? []) {
    for (const [x, fx] of bracket(G.xs, e.x)) for (const [y, fy] of bracket(ys, e.y)) {
      const id = node(x, y, G.zAt(x)), w = e.weight * fx * fy
      if (w) nodal(id, 'D', e.id, -w)
      weight(id, w * e.seismicFraction, e.id)
    }
    meta.sources.push({ id: e.id, kind: 'equipment', dead: e.weight, live: 0, seismic: e.weight * e.seismicFraction })
  }
  const p = activePlatform(s)
  if (p) {
    const count = Math.ceil((p.x1 - p.x0) / p.beamSpacing)
    const supportsAt = new Map(ys.map((y)=>[y,[...new Set(elements.filter((e)=>!e.addition && (e.role==='column'||e.role==='post') && Math.abs(byId(e.n1).y-y)<1e-7 && byId(e.n1).z<=p.elevation && byId(e.n2).z>=p.elevation).map((e)=>byId(e.n1).x))].filter((x)=>x>=p.x0 && x<=p.x1)]))
    const supportXs = [...new Set([p.x0, p.x1, ...ys.slice(p.firstBay,p.lastBay+1).flatMap((y)=>supportsAt.get(y)!)])].sort((a,b)=>a-b)
    const xs = [...Array.from({ length: count + 1 }, (_, i) => p.x0 + (p.x1 - p.x0) * i / count), ...supportXs].sort((a, b) => a - b).filter((v,i,all)=>i===0 || v-all[i-1]>1e-7)
    const nx = xs.length - 1
    for (let b = p.firstBay; b <= p.lastBay; b++) {
      for (const x of [...new Set([p.x0,p.x1,...supportsAt.get(ys[b])!])]) {
        if (supportsAt.get(ys[b])!.some((v) => Math.abs(v - x) < 1e-7)) splitColumn(x, ys[b], p.elevation)
        else {
          const bottom = node(x, ys[b], 0), top = node(x, ys[b], p.elevation)
          addMember(bottom, top, p.columnSection, 'platform-column', `${p.id}:column:${coord(x, ys[b], 0)}`, p.id); meta.fixedBases.push(bottom)
        }
      }
      for (let i = 0; i < nx; i++) addMember(node(xs[i], ys[b], p.elevation), node(xs[i + 1], ys[b], p.elevation), p.beamSection, 'platform-beam', `${p.id}:main:${b}`, p.id)
    }
    for (let b = p.firstBay; b < p.lastBay; b++) for (let i = 0; i <= nx; i++) {
      const trib = ((xs[i + 1] ?? xs[i]) - (xs[i - 1] ?? xs[i])) / 2, L = ys[b + 1] - ys[b]
      const mid = (ys[b] + ys[b + 1]) / 2
      for (const [ya, yb] of [[ys[b], mid], [mid, ys[b + 1]]]) {
        const e = addMember(node(xs[i], ya, p.elevation), node(xs[i], yb, p.elevation), p.beamSection, 'platform-beam', `${p.id}:secondary:${b}:${i}`, p.id)
        beamLoads.push({ member: e, case: 'D', source: p.id, q: p.dead * trib }, { member: e, case: 'PL', source: p.id, q: p.live * trib })
        for (const id of [e.n1, e.n2]) weight(id, (p.dead + p.liveMassFraction * p.live) * trib * L / 4, p.id)
      }
    }
    const area = (p.x1 - p.x0) * (ys[p.lastBay] - ys[p.firstBay])
    meta.sources.push({ id: p.id, kind: 'platform', dead: area * p.dead, live: area * p.live, seismic: area * (p.dead + p.live * p.liveMassFraction) })
  }
  const c = activeCrane(s)
  if (c) {
    for (const y of ys) for (const x of [0, s.span]) splitColumn(x, y, c.elevation)
    const limit = ys.at(-1)! - c.wheelSpacing
    const positions = [...new Set([0, limit, ...ys.flatMap((y) => [y, y - c.wheelSpacing])].filter((v) => v >= 0 && v <= limit).map((v) => +v.toFixed(7)))].sort((a, b) => a - b)
    for (const position of positions) for (const maxRail of ['left', 'right'] as const) for (const lateralSign of c.lateral ? [-1, 1] : [0]) for (const brakingSign of c.braking ? [-1, 1] : [0]) {
      const name = `CR${String(meta.craneCases.length + 1).padStart(3, '0')}`
      meta.craneCases.push({ name, position, maxRail, lateralSign, brakingSign })
      for (const rail of ['left', 'right'] as const) for (const wheel of [position, position + c.wheelSpacing]) for (const [y, share] of bracket(ys, wheel)) {
        const x = rail === 'left' ? 0 : s.span, rx = rail === 'left' ? c.eccentricity : -c.eccentricity
        const fz = -(rail === maxRail ? c.maxWheel : c.minWheel) * c.impactFactor * share
        const fx = lateralSign * c.lateral / 4 * share, fy = brakingSign * c.braking / 4 * share
        nodal(node(x, y, c.elevation), name, c.id, fz, fx, fy, -rx * fz, rx * fy)
      }
    }
    for (const x of [0, s.span]) for (const y of ys) weight(node(x, y, c.elevation), c.seismicWeight / (2 * ys.length), c.id)
    meta.sources.push({ id: c.id, kind: 'crane', dead: 0, live: 0, seismic: c.seismicWeight })
  }
  // Base elements stay first so existing load generators can index ID-1 safely.
  elements.sort((a, b) => Number(!!a.addition) - Number(!!b.addition)); elements.forEach((e, i) => { e.id = i + 1 })
  for (const v of beamLoads) meta.beam.push({ element: v.member.id, case: v.case, source: v.source, q: v.q })
  const gamma = profileOf(s.code).materials[s.material].gamma
  const grouped = new Map<string, Element[]>()
  for (const e of elements) { const list = grouped.get(e.physicalKey!) ?? []; list.push(e); grouped.set(e.physicalKey!, list) }
  for (const [key, es] of grouped) {
    const length = es.reduce((sum, e) => { const a = byId(e.n1), b = byId(e.n2); return sum + Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) }, 0)
    meta.members.push({ key, elementIds: es.map((e) => e.id), length, source: es[0].sourceId ?? 'factory' })
  }
  for (const e of elements.filter((e) => e.addition)) {
    const a = byId(e.n1), b = byId(e.n2), w = gamma * sectionProps(e.section).A * 1e-6 * Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)
    weight(e.n1, w / 2, e.sourceId!); weight(e.n2, w / 2, e.sourceId!)
    const source = meta.sources.find((v) => v.id === e.sourceId)!; source.dead += w; source.seismic += w
  }
  return { nodes, elements, additions: meta }
}
