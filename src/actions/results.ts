/* 해석 결과 회수 (M2) — 설계 검토에 필요한 표를 Gen NX post/TABLE 에서 받아 파싱.
   - BEAMFORCE: 보 요소 × 하중조합(CB) × 5 지점(I, 1/4, 2/4, 3/4, J) — 라이브 410 요소·22 조합 ≈ 4.3만 행 / 11 s
   - TRUSSFORCE: 가새 축력
   - REACTIONG 합계 + DISPLACEMENTG 처마 절점: 조합별 B2 (8.2-5) 산정
   - DISPLACEMENTG 사용 하중(ST): 풍·지진 층간변위각, 지붕 활하중 처짐 */
import { portalGeometry } from '../domain/portal'
import type { Built } from '../state/store'
import { mapi } from '../mapi/client'
import { stage } from './job'

export interface ForcePt { P: number; Vy: number; Vz: number; My: number; Mz: number }
export interface Results {
  /** 요소 → 조합 → 5 지점 */
  beam: Map<number, Map<string, ForcePt[]>>
  /** 가새 요소 → 조합 → 축력 (+ 인장) */
  truss: Map<number, Map<string, number>>
  /** 조합 → 방향별 B2 입력 */
  sway: Map<string, Record<'X' | 'Y', { sumPu: number; drift: number; sumH: number }>>
  /** 사용 하중 케이스 → 절점 → 변위 (m) */
  disp: Map<string, Map<number, { dx: number; dy: number; dz: number }>>
  combos: string[]
}

const num = (s: string) => +s

async function table(type: string, name: string, keys: number[], loads: string[], extra: Record<string, unknown> = {}, components?: string[]) {
  const j = await mapi<any>('POST', '/post/TABLE', {
    Argument: {
      TABLE_NAME: name, TABLE_TYPE: type, UNIT: { FORCE: 'KN', DIST: 'M' }, STYLES: { FORMAT: 'Fixed', PLACE: 5 },
      ...(components ? { COMPONENTS: components } : {}),
      NODE_ELEMS: { KEYS: keys }, LOAD_CASE_NAMES: loads, ...extra,
    },
  }, `${type} · ${keys.length} × ${loads.length}`)
  return j?.[name] as { HEAD: string[]; DATA: string[][]; SUB_TABLES?: any[] } | undefined
}

export async function fetchResults(b: Built): Promise<Results> {
  const { model, spec } = b
  const combos = b.comboNames
  const cb = combos.map((c) => `${c}(CB)`)
  const beamIds = model.elements.filter((e) => e.role !== 'brace').map((e) => e.id)
  const trussIds = model.elements.filter((e) => e.role === 'brace').map((e) => e.id)

  /* 보 부재력 */
  const beam = new Map<number, Map<string, ForcePt[]>>()
  const beamRows: string[][] = []
  const batchSize = spec.code === 'CN' ? 4 : cb.length
  stage('st_results', Math.ceil(cb.length / batchSize) + (trussIds.length ? 1 : 0) + 3)
  for (let offset = 0; offset < cb.length; offset += batchSize) {
    const bf = await table('BEAMFORCE', spec.code === 'CN' ? `F${offset}` : 'F', beamIds, cb.slice(offset, offset + batchSize), { PARTS: ['PartI', 'Part1/4', 'Part2/4', 'Part3/4', 'PartJ'] },
      ['Elem', 'Load', 'Part', 'Axial', 'Shear-y', 'Shear-z', 'Moment-y', 'Moment-z'])
    if (spec.code === 'CN' && !bf?.DATA?.length) throw new Error('GB: beam-force table is empty')
    beamRows.push(...bf?.DATA ?? [])
  }
  for (const r of beamRows) {
    const [, el, lc, , P, Vy, Vz, My, Mz] = r
    const m = beam.get(+el) ?? new Map<string, ForcePt[]>()
    beam.set(+el, m)
    const arr = m.get(lc) ?? []
    m.set(lc, arr)
    arr.push({ P: num(P), Vy: num(Vy), Vz: num(Vz), My: num(My), Mz: num(Mz) })
  }

  /* 가새 축력 — 인장 +, I·J 중 절댓값 큰 쪽 */
  const truss = new Map<number, Map<string, number>>()
  if (trussIds.length) {
    const tf = await table('TRUSSFORCE', 'T', trussIds, cb)
    for (const [, el, lc, fi, fj] of tf?.DATA ?? []) {
      const m = truss.get(+el) ?? new Map<string, number>()
      truss.set(+el, m)
      m.set(lc, Math.abs(num(fi)) > Math.abs(num(fj)) ? num(fi) : num(fj))
    }
  }

  /* B2 입력 — 조합별 반력 합(ΣPu = ΣFZ, ΣH = |ΣFX|·|ΣFY|), 처마 절점(기둥 상단) 평균 변위 */
  const G = portalGeometry(spec)
  const eaveNodes = model.nodes.filter((n) => Math.abs(n.z - spec.eaveHeight) < 1e-9 && (n.x === 0 || n.x === spec.span))
  const base = model.nodes.find((n) => n.z === 0)!
  const rx = await table('REACTIONG', 'R', [base.id], cb, {}, ['Node', 'Load', 'FX', 'FY', 'FZ'])
  const sums = new Map<string, number[]>()
  for (const [lc, fx, fy, fz] of (rx?.SUB_TABLES?.[0]?.['SUMMATION OF REACTION FORCES PRINTOUT']?.DATA ?? []) as string[][]) sums.set(lc, [num(fx), num(fy), num(fz)])
  const ux = await table('DISPLACEMENTG', 'U', eaveNodes.map((n) => n.id), cb, {}, ['Node', 'Load', 'DX', 'DY', 'DZ'])
  const dsum = new Map<string, number[]>()
  for (const [, , lc, dx, dy] of ux?.DATA ?? []) {
    const a = dsum.get(lc) ?? [0, 0, 0]
    a[0] += num(dx); a[1] += num(dy); a[2]++
    dsum.set(lc, a)
  }
  const sway = new Map<string, Record<'X' | 'Y', { sumPu: number; drift: number; sumH: number }>>()
  for (const c of combos) {
    const s = sums.get(c) ?? [0, 0, 0], d = dsum.get(c) ?? [0, 0, 1]
    sway.set(c, {
      X: { sumPu: Math.abs(s[2]), drift: Math.abs(d[0] / d[2]), sumH: Math.abs(s[0]) },
      Y: { sumPu: Math.abs(s[2]), drift: Math.abs(d[1] / d[2]), sumH: Math.abs(s[1]) },
    })
  }

  /* 사용성 — 처마·마루 절점 변위 (사용 하중 케이스) */
  const ridge = model.nodes.filter((n) => Math.abs(n.z - G.ridgeZ) < 1e-9 && Math.abs(n.x - spec.span / 2) < 1e-9)
  const svcNodes = [...eaveNodes, ...ridge]
  const svcCases = b.cases.filter((c) => spec.code === 'CN' || c !== 'D')
  const us = await table('DISPLACEMENTG', 'S', svcNodes.map((n) => n.id), svcCases.map((c) => `${c}(ST)`), {}, ['Node', 'Load', 'DX', 'DY', 'DZ'])
  const disp = new Map<string, Map<number, { dx: number; dy: number; dz: number }>>()
  for (const [, nd, lc, dx, dy, dz] of us?.DATA ?? []) {
    const m = disp.get(lc) ?? new Map()
    disp.set(lc, m)
    m.set(+nd, { dx: num(dx), dy: num(dy), dz: num(dz) })
  }
  return { beam, truss, sway, disp, combos }
}
