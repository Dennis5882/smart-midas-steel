/* GB-only member and service checks. Generic result shape is shared with TW,
   while all resistance factors, equations, lengths and limits live here. */
import { cnCapacity, cnCheck, cnK } from '../codes/cnSteel'
import type { Results } from '../actions/results'
import type { DesignResult, MemberCheck, ServiceCheck, CCSummary } from './design'
import type { FactorySpec, FactoryModel, ElementRole } from './types'
import type { LoadInfo } from './loads'
import { portalGeometry } from './portal'
import { sectionProps } from './sections'
import { cnCCLoads } from './cnSecondary'
import { validateDesignResults } from './resultValidation'

export function runCnDesign(spec: FactorySpec, model: FactoryModel, info: LoadInfo, res: Results, roles?: readonly ElementRole[]): DesignResult {
  validateDesignResults(spec, model, info, res, roles)
  const G = portalGeometry(spec), nodes = new Map(model.nodes.map((n) => [n.id, n]))
  const col = sectionProps(spec.sections.column), raf = sectionProps(spec.sections.rafter)
  const K = cnK((col.Ix / spec.eaveHeight) / (raf.Ix / (2 * G.slopeLen)), spec.baseFixity === 'fixed')
  const cc = cnCCLoads(spec, model, info), members: MemberCheck[] = [], service: ServiceCheck[] = []
  for (const e of model.elements) {
    if (roles && !roles.includes(e.role)) continue
    const a = nodes.get(e.n1)!, b = nodes.get(e.n2)!, sp = sectionProps(e.section)
    const L = 1000 * Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)
    const secL = Math.min(L, 1000 * spec.baySpacing / (spec.sagRods + 1))
    const lens = e.role === 'column' ? { KLx: K * spec.eaveHeight * 1000, KLy: L, Lb: L }
      : e.role === 'rafter' ? { KLx: G.slopeLen * 1000, KLy: L, Lb: L }
      : e.role === 'purlin' || e.role === 'girt' ? { KLx: L, KLy: secL, Lb: secL }
      : e.role === 'post' ? { KLx: G.zAt(a.x) * 1000, KLy: L, Lb: L } : { KLx: L, KLy: L, Lb: L }
    const material = e.role === 'purlin' || e.role === 'girt' ? spec.secondaryMaterial ?? 'Q235B' : spec.material
    let best: MemberCheck | undefined
    let compression = false
    const consider = (combo: string, part: number, forces: MemberCheck['forces']) => {
      compression ||= forces.P < -1e-6
      const cap = cnCapacity(sp, material, lens, Math.max(0, -forces.P))
      const sw = res.sway.get(combo)
      let sway = 1
      if ((e.role === 'column' || e.role === 'rafter') && sw) for (const d of ['X', 'Y'] as const) {
        const s = sw[d], theta = s.sumH > 1e-8 ? s.sumPu * s.drift / (s.sumH * spec.eaveHeight) : 0
        sway = Math.max(sway, theta >= 1 ? 99 : 1 / (1 - theta))
      }
      const chk = cnCheck(cap, forces, sway)
      if (!best || chk.ratio > best.ratio) best = { id: e.id, role: e.role, section: e.section, ratio: chk.ratio, combo, part, eq: chk.eq, forces, cap, B: chk.B, Cb: 1, lengths: lens, slender: { value: 0, limit: 0 }, notes: cap.notes }
    }
    if (e.role === 'brace') for (const [combo, P] of res.truss.get(e.id) ?? []) consider(combo, -1, { P, Mx: 0, My: 0, V: 0 })
    else for (const [combo, pts] of res.beam.get(e.id) ?? []) for (const [part, p] of pts.entries()) consider(combo, part, { P: p.P, Mx: Math.abs(p.My), My: Math.abs(p.Mz) * (e.role === 'purlin' || e.role === 'girt' ? 1 / (spec.sagRods + 1) ** 2 : 1), V: Math.abs(p.Vz) })
    for (const d of cc.get(e.id)?.demands ?? []) consider(d.combo, 2, d.f)
    if (!best) throw new Error(`GB: missing analysis forces for element ${e.id}`)
    const m = best as MemberCheck
    // GB 50017 table 7.4.6: primary compression 150, other compression 200;
    // primary tension 350. Brace full length: crossing is not modelled as a support.
    m.slender = { value: Math.max(lens.KLx / sp.rx, lens.KLy / sp.ry), limit: compression ? (e.role === 'column' ? 150 : 200) : 350 }
    if (m.slender.value / m.slender.limit > m.ratio) { m.ratio = m.slender.value / m.slender.limit; m.eq = 'GB 7.4.6' }
    members.push(m)
  }
  if (!roles) {
    const eaves = model.nodes.filter((n) => Math.abs(n.z - spec.eaveHeight) < 1e-8 && (n.x === 0 || n.x === spec.span))
    const ridges = model.nodes.filter((n) => Math.abs(n.z - G.ridgeZ) < 1e-8 && Math.abs(n.x - spec.span / 2) < 1e-8)
    const disp = (lc: string, id: number) => {
      const v = res.disp.get(lc)?.get(id)
      if (!v || ![v.dx, v.dy, v.dz].every(Number.isFinite)) throw new Error(`GB: missing/invalid service displacement ${lc}, node ${id}`)
      return v
    }
    const push = (key: ServiceCheck['key'], value: number, limit: number, lc: string, clause: string) => service.push({ key, value, limit, ratio: value / limit, case: lc, clause })
    for (const [d, comp, wk, ek] of [['X', 'dx', 'windDriftX', 'seisDriftX'], ['Y', 'dy', 'windDriftY', 'seisDriftY']] as const) {
      let max = 0, at = ''
      for (const w of info.wind.variants) for (const n of eaves) { const v = Math.abs(disp(w.tag, n.id)[comp]); if (v > max) { max = v; at = w.tag } }
      push(wk, max / spec.eaveHeight, 1 / 150, at, 'GB 50017 B.2.1 (metal cladding, H≤18m; conservative H/150)')
      const ex = res.disp.get(`E${d}`)
      if (!ex) throw new Error(`GB: missing service displacement E${d}`)
      push(ek, Math.max(0, ...eaves.map((n) => Math.abs(disp(`E${d}`, n.id)[comp]))) / spec.eaveHeight, 1 / 250, `E${d}`, 'Project criterion H/250 (GB/T 50011 5.5.1 reference; single-storey)')
    }
    let maxDefl = 0, at = ''
    for (const lc of ['LR', ...res.disp.keys()].filter((x, i, a) => (x === 'LR' || x.startsWith('SN')) && a.indexOf(x) === i)) {
      for (const r of ridges) {
        const peers = eaves.filter((n) => Math.abs(n.y - r.y) < 1e-8)
        const dz = (id: number) => disp('D', id).dz + disp(lc, id).dz
        const v = Math.abs(dz(r.id) - peers.reduce((s, n) => s + dz(n.id), 0) / Math.max(1, peers.length))
        if (v > maxDefl) { maxDefl = v; at = `D+${lc}` }
      }
    }
    push('rafterDefl', maxDefl, spec.span / 180, at, 'GB 50017 B.1.1: metal roof without ceiling')
    const pur = sectionProps(spec.sections.purlin)
    const q = (spec.roofDead + Math.max(info.roofLive, info.snow ?? 0) * Math.cos(G.theta)) * G.sRoof + 78.5 * pur.A * 1e-6
    push('purlinDefl', 5 * q * spec.baySpacing ** 4 / (384 * 206000e3 * pur.Ix * 1e-12), spec.baySpacing / 150, 'D+max(LR,SN)', 'GB 50017 B.1.1: metal roof purlin')
  }
  const byRole: DesignResult['byRole'] = {}
  for (const m of members) if (!byRole[m.role] || m.ratio > byRole[m.role]!.ratio) byRole[m.role] = m
  const sums = new Map<string, CCSummary>()
  if (!roles) for (const [id, c] of cc) { const role = model.elements.find((e) => e.id === id)!.role, key = `${role}-${c.zone}`, old = sums.get(key); if (old) old.count++; else sums.set(key, { role, zone: c.zone, A: c.A, pPos: c.pPos, pNeg: c.pNeg, count: 1 }) }
  return { members, byRole, service, maxRatio: Math.max(0, ...members.map((m) => m.ratio)), ng: members.filter((m) => m.ratio > 1).length + service.filter((s) => s.ratio > 1).length, cc: [...sums.values()] }
}
