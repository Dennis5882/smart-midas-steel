import type { Element, ElementRole, FactoryModel, FactorySpec, Node } from './types'

/** 단경간 포털 프레임 + 2차부재 형상 생성 (순수 함수). */
export function buildPortal(spec: FactorySpec): FactoryModel {
  const { span, bays, baySpacing, eaveHeight, roofSlope, purlinSpacing, girtSpacing, sections: sec } = spec
  const nodes: Node[] = []
  const elements: Element[] = []
  const key = (x: number, y: number, z: number) => [x, y, z].map((v) => v.toFixed(4)).join('|')
  const byKey = new Map<string, number>()
  const node = (x: number, y: number, z: number) => {
    const k = key(x, y, z)
    let id = byKey.get(k)
    if (id === undefined) { id = nodes.length + 1; byKey.set(k, id); nodes.push({ id, x, y, z }) }
    return id
  }
  const elem = (a: number, b: number, role: ElementRole, section: string) => {
    elements.push({ id: elements.length + 1, n1: a, n2: b, role, section })
  }
  /** 두 점 사이를 등분해 부재 생성, 지정 높이/간격으로 중간 절점 포함 */
  const ridgeZ = eaveHeight + (span / 2) * roofSlope
  const zAt = (x: number) => eaveHeight + Math.min(x, span - x) * roofSlope
  const nPurlin = Math.max(1, Math.round(Math.hypot(span / 2, ridgeZ - eaveHeight) / purlinSpacing))
  const nGirt = Math.max(1, Math.round(eaveHeight / girtSpacing))

  const rafterXs = Array.from({ length: nPurlin + 1 }, (_, i) => (span / 2) * (i / nPurlin))
  const xs = [...rafterXs, ...rafterXs.slice(0, -1).reverse().map((x) => span - x)]

  for (let b = 0; b <= bays; b++) {
    const y = b * baySpacing
    // 기둥: 거트 높이마다 절점
    for (const x of [0, span]) {
      let prev = node(x, y, 0)
      for (let g = 1; g <= nGirt; g++) {
        const cur = node(x, y, (eaveHeight * g) / nGirt)
        elem(prev, cur, 'column', sec.column)
        prev = cur
      }
    }
    // 지붕보: 퍼린 위치마다 절점
    for (let i = 0; i < xs.length - 1; i++) {
      elem(node(xs[i], y, zAt(xs[i])), node(xs[i + 1], y, zAt(xs[i + 1])), 'rafter', sec.rafter)
    }
  }
  // 길이 방향 2차부재 (인접 프레임 사이)
  for (let b = 0; b < bays; b++) {
    const y0 = b * baySpacing, y1 = y0 + baySpacing
    for (const x of xs) {
      const isEave = x === 0 || x === span, isRidge = Math.abs(x - span / 2) < 1e-9
      elem(node(x, y0, zAt(x)), node(x, y1, zAt(x)), isEave || isRidge ? 'strut' : 'purlin', isEave || isRidge ? sec.strut : sec.purlin)
    }
    for (const x of [0, span]) {
      for (let g = 1; g < nGirt; g++) {
        const z = (eaveHeight * g) / nGirt
        elem(node(x, y0, z), node(x, y1, z), 'girt', sec.girt)
      }
    }
  }
  return { nodes, elements }
}
