import type { Element, ElementRole, Face, FactoryModel, FactorySpec, Node } from './types'

/** 형상 상수 — 하중·설계가 같은 값을 쓰도록 한 곳에서 계산 */
export function portalGeometry(spec: FactorySpec) {
  const { span, bays, baySpacing, eaveHeight, roofSlope, purlinSpacing, girtSpacing } = spec
  const rise = (span / 2) * roofSlope
  const slopeLen = Math.hypot(span / 2, rise)
  const nPurlin = Math.max(1, Math.round(slopeLen / purlinSpacing))
  const nGirt = Math.max(1, Math.round(eaveHeight / girtSpacing))
  const rafterXs = Array.from({ length: nPurlin + 1 }, (_, i) => (span / 2) * (i / nPurlin))
  /** 지붕보 절점 x (처마 → 마루 → 처마) */
  const xs = [...rafterXs, ...rafterXs.slice(0, -1).reverse().map((x) => span - x)]
  const zAt = (x: number) => eaveHeight + Math.min(x, span - x) * roofSlope
  /** 거트 높이 (기초·처마 제외) */
  const girtZs = Array.from({ length: nGirt - 1 }, (_, g) => (eaveHeight * (g + 1)) / nGirt)
  /** 박공벽 풍주 x — 목표 간격으로 등분한 뒤 가장 가까운 지붕보 절점에 맞춤 */
  const nPost = Math.max(1, Math.round(span / Math.max(spec.postSpacing, 1)))
  const postXs = [...new Set(Array.from({ length: nPost - 1 }, (_, k) => {
    const target = (span * (k + 1)) / nPost
    return xs.reduce((a, b) => (Math.abs(b - target) < Math.abs(a - target) ? b : a))
  }))].filter((x) => x > 0 && x < span).sort((a, b) => a - b)
  return {
    rise, slopeLen, nPurlin, nGirt, xs, zAt, girtZs, postXs,
    sRoof: slopeLen / nPurlin, gWall: eaveHeight / nGirt, length: bays * baySpacing,
    theta: Math.atan(roofSlope), ridgeZ: eaveHeight + rise,
  }
}

/** 단경간 포털 프레임 + 2차부재 + 박공벽 풍주·거트 + 양 끝 베이 X-가새 형상 생성 (순수 함수).
    전역: X = 스팬, Y = 길이, Z = 높이. */
export function buildPortal(spec: FactorySpec): FactoryModel {
  const { span, bays, baySpacing, eaveHeight, sections: sec } = spec
  const G = portalGeometry(spec)
  const nodes: Node[] = []
  const elements: Element[] = []
  const byKey = new Map<string, number>()
  const node = (x: number, y: number, z: number) => {
    const k = [x, y, z].map((v) => v.toFixed(4)).join('|')
    let id = byKey.get(k)
    if (id === undefined) { id = nodes.length + 1; byKey.set(k, id); nodes.push({ id, x, y, z }) }
    return id
  }
  const elem = (a: number, b: number, role: ElementRole, section: string, face?: Face) => {
    elements.push({ id: elements.length + 1, n1: a, n2: b, role, section, ...(face ? { face } : {}) })
  }
  const yOf = (b: number) => b * baySpacing
  const gableFace = (b: number): Face | null => (b === 0 ? 'y0' : b === bays ? 'yL' : null)

  for (let b = 0; b <= bays; b++) {
    const y = yOf(b)
    const gable = gableFace(b)
    /* 기둥: 거트 높이마다 절점 */
    for (const x of [0, span]) {
      let prev = node(x, y, 0)
      for (const z of [...G.girtZs, eaveHeight]) {
        const cur = node(x, y, z)
        elem(prev, cur, 'column', sec.column)
        prev = cur
      }
    }
    /* 박공벽 풍주: 기초 → 지붕보 절점, 거트 높이마다 절점 */
    if (gable) {
      for (const x of G.postXs) {
        let prev = node(x, y, 0)
        for (const z of [...G.girtZs.filter((z) => z < G.zAt(x) - 1e-6), G.zAt(x)]) {
          const cur = node(x, y, z)
          elem(prev, cur, 'post', sec.post, gable)
          prev = cur
        }
      }
    }
    /* 지붕보: 퍼린 위치마다 절점 */
    for (let i = 0; i < G.xs.length - 1; i++) {
      elem(node(G.xs[i], y, G.zAt(G.xs[i])), node(G.xs[i + 1], y, G.zAt(G.xs[i + 1])), 'rafter', sec.rafter)
    }
    /* 박공 거트: 기둥·풍주 사이, 거트 높이마다 */
    if (gable) {
      const lines = [0, ...G.postXs, span]
      for (const z of G.girtZs) {
        for (let i = 0; i < lines.length - 1; i++) {
          if (z >= G.zAt(lines[i]) || z >= G.zAt(lines[i + 1])) continue
          elem(node(lines[i], y, z), node(lines[i + 1], y, z), 'girt', sec.girt, gable)
        }
      }
    }
  }

  /* 길이 방향 2차부재 (인접 프레임 사이) */
  for (let b = 0; b < bays; b++) {
    const y0 = yOf(b), y1 = yOf(b + 1)
    for (const x of G.xs) {
      const edge = x === 0 || x === span || Math.abs(x - span / 2) < 1e-9 // 처마·마루
      elem(node(x, y0, G.zAt(x)), node(x, y1, G.zAt(x)), edge ? 'strut' : 'purlin', edge ? sec.strut : sec.purlin)
    }
    for (const x of [0, span]) {
      for (const z of G.girtZs) elem(node(x, y0, z), node(x, y1, z), 'girt', sec.girt, x === 0 ? 'x0' : 'xL')
    }
  }

  /* X-가새 (TRUSS) — 양 측벽과 양 지붕면, 교차점은 연결하지 않음.
     베이가 4 이상이면 끝에서 두 번째 베이에 둔다: 박공 프레임은 중력하중이 절반이라 내부 프레임과 처짐이 달라,
     끝 베이 지붕 가새가 중력에서 큰 축력(라이브: 187 kN 압축)을 받는다. 박공 풍하중은 끝 베이 스트럿이 가새 베이로 전달. */
  const braceBays = [...new Set(bays >= 4 ? [1, bays - 2] : [0, bays - 1])].filter((b) => b >= 0)
  for (const b of braceBays) {
    const y0 = yOf(b), y1 = yOf(b + 1)
    for (const x of [0, span]) {
      const f: Face = x === 0 ? 'x0' : 'xL'
      elem(node(x, y0, 0), node(x, y1, eaveHeight), 'brace', sec.brace, f)
      elem(node(x, y1, 0), node(x, y0, eaveHeight), 'brace', sec.brace, f)
    }
    for (const x of [0, span]) {
      elem(node(x, y0, eaveHeight), node(span / 2, y1, G.ridgeZ), 'brace', sec.brace, 'roof')
      elem(node(x, y1, eaveHeight), node(span / 2, y0, G.ridgeZ), 'brace', sec.brace, 'roof')
    }
  }
  return { nodes, elements }
}
