/* Analysis data must be complete before a design check can claim a result.
   Pure validation shared by TW/CN, including callers using saved results. */
import type { Results } from '../actions/results'
import type { LoadInfo } from './loads'
import { portalGeometry } from './portal'
import type { ElementRole, FactoryModel, FactorySpec } from './types'

export class ResultValidationError extends Error {
  constructor(detail: string) { super(detail); this.name = 'ResultValidationError' }
}

export function requireResult(ok: unknown, detail: string): asserts ok {
  if (!ok) throw new ResultValidationError(detail)
}

/** Reject blank/missing numeric cells as well as NaN/Infinity. Zero is valid. */
export function resultNumber(value: unknown, detail: string): number {
  requireResult((typeof value === 'number' || typeof value === 'string') && String(value).trim() !== '', detail)
  const n = Number(value)
  requireResult(Number.isFinite(n), detail)
  return n
}

export function serviceNodes(spec: FactorySpec, model: FactoryModel) {
  const G = portalGeometry(spec)
  const eaves = model.nodes.filter((n) => Math.abs(n.z - spec.eaveHeight) < 1e-9 && (n.x === 0 || n.x === spec.span))
  const ridge = model.nodes.filter((n) => Math.abs(n.z - G.ridgeZ) < 1e-9 && Math.abs(n.x - spec.span / 2) < 1e-9)
  return { eaves, nodes: [...new Map([...eaves, ...ridge].map((n) => [n.id, n])).values()] }
}

export function validateDesignResults(spec: FactorySpec, model: FactoryModel, info: LoadInfo, res: Results, roles?: readonly ElementRole[]): void {
  const combos = Object.keys(info.comboKind ?? {})
  requireResult(combos.length > 0 && combos.length === res.combos.length && new Set(res.combos).size === combos.length && combos.every((c) => res.combos.includes(c)), 'COMBINATIONS: expected load combinations missing or changed')
  for (const e of model.elements) {
    if (roles && !roles.includes(e.role)) continue
    for (const c of combos) {
      if (e.role === 'brace') {
        requireResult(Number.isFinite(res.truss.get(e.id)?.get(c)), `TRUSSFORCE: element ${e.id}, ${c}`)
      } else {
        const ps = res.beam.get(e.id)?.get(c)
        requireResult(ps?.length === 5, `BEAMFORCE: element ${e.id}, ${c}, expected 5 stations`)
        for (let i = 0; i < 5; i++) requireResult(ps[i] && ['P', 'Vy', 'Vz', 'My', 'Mz'].every((k) => Number.isFinite(ps[i][k as keyof typeof ps[number]])), `BEAMFORCE: element ${e.id}, ${c}, station ${i}`)
      }
    }
  }
  for (const c of combos) for (const d of ['X', 'Y'] as const) {
    const v = res.sway.get(c)?.[d]
    requireResult(v && [v.sumPu, v.drift, v.sumH].every((n) => Number.isFinite(n) && n >= 0), `SWAY: ${c}, ${d}`)
  }
  if (roles) return // Candidate sections use the already checked service result.
  const { nodes } = serviceNodes(spec, model)
  requireResult(nodes.length > 0, 'DISPLACEMENT: no service nodes')
  const cases = new Set(['LR', 'EX', 'EY', ...(spec.code === 'TW' ? ['ETX', 'ETY'] : ['D']), ...info.wind.variants.flatMap((w) => w.parts.map((p) => p.lc))])
  // Snow cases are defined by the model's combinations, never by returned data.
  for (const c of combos) for (const s of c.match(/SN\d*/g) ?? []) cases.add(s)
  for (const c of cases) for (const n of nodes) {
    const v = res.disp.get(c)?.get(n.id)
    requireResult(v && [v.dx, v.dy, v.dz].every(Number.isFinite), `DISPLACEMENT: ${c}, node ${n.id}`)
  }
}
