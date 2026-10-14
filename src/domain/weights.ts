/* 부재 무게 (순수 함수) — 지진력 분배용 절점 무게. 단면적은 CNS2020 단면명의 치수로 계산(필렛 무시 → 실제보다 1~2% 작음). */
import { profileOf } from '../codes'
import type { FactoryModel, FactorySpec } from './types'

/** 단면적 mm². RH/BH `H x B x tw x tf`, CC(립 C형강) `H x B x lip/t` */
export function sectionArea(name: string): number {
  const [kind, dims] = name.split(' ')
  if (kind === 'RH' || kind === 'BH') {
    const [H, B, tw, tf] = dims.split('x').map(Number)
    return 2 * B * tf + (H - 2 * tf) * tw
  }
  if (kind === 'CC') {
    const [size, t] = dims.split('/')
    const [H, B, lip] = size.split('x').map(Number)
    return +t * (H + 2 * B + 2 * lip)
  }
  throw new Error(`area: unsupported section ${name}`)
}

/** 절점별 고정하중 무게 (kN): 부재 자중(γ·A·L/2씩 양 끝) + 요소 선하중(마감) 총량/2씩 */
export function nodeWeights(spec: FactorySpec, model: FactoryModel, elemDeadLine: (elemId: number) => number): Map<number, number> {
  const gamma = profileOf(spec.code).materials[spec.material].gamma // kN/m³
  const nodes = new Map(model.nodes.map((n) => [n.id, n]))
  const w = new Map<number, number>()
  const add = (id: number, v: number) => w.set(id, (w.get(id) ?? 0) + v)
  for (const e of model.elements) {
    const a = nodes.get(e.n1)!, b = nodes.get(e.n2)!
    const len = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)
    const total = (gamma * sectionArea(e.section) * 1e-6 + elemDeadLine(e.id)) * len
    add(e.n1, total / 2)
    add(e.n2, total / 2)
  }
  return w
}
