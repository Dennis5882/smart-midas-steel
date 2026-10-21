/* RC 받침(墩柱) 1단계 오프라인 회귀 — 형상·지점·거트·풍·지진 기준 높이·입력·적용범위·강성 확인 (Gen·키 불필요)
   실행: node --import tsx scripts/verify-pedestal.ts */
import assert from 'node:assert/strict'
;(globalThis as any).document = { documentElement: { lang: 'ko', dataset: {} } }
const { DEFAULT_SPEC, CN_DEFAULT_SPEC, isBaseNode, steelHeight } = await import('../src/domain/types')
const { buildPortal, portalGeometry } = await import('../src/domain/portal')
const { buildGenPayloads } = await import('../src/domain/gen')
const { buildLoadPayloads } = await import('../src/domain/loads')
const { windSummary } = await import('../src/domain/windSummary')
const { checkScope } = await import('../src/domain/scope')
const { pedestalCheck, pedestalEaveDelta } = await import('../src/domain/pedestal')
const { toSpec, initVals } = await import('../src/components/planFields')
const { defaultAdditions } = await import('../src/domain/additions')
let n = 0
const ok = (c: unknown, m: string) => { assert.ok(c, m); n++ }
const near = (a: number, b: number, tol = 1e-9) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b))

const h = 1.0
const ped = { ...structuredClone(DEFAULT_SPEC), pedestal: { height: h, b: 600, d: 600 } }
for (const frame of [undefined, 'mono', 'multi', 'gableCols', 'truss'] as const) {
  const base = { ...structuredClone(DEFAULT_SPEC), ...(frame ? { frame } : {}), ...(frame === 'multi' || frame === 'gableCols' ? { spanList: [24, 24], span: 48 } : {}), ...(frame === 'truss' ? { span: 30 } : {}) }
  const s = { ...base, pedestal: { height: h, b: 600, d: 600 } }
  const m0 = buildPortal(base), m = buildPortal(s), G = portalGeometry(s)
  const tag = frame ?? 'gable'
  ok(m.baseZ === h && G.baseZ === h && m0.baseZ === undefined, `${tag}: model/geometry base at pedestal top`)
  const bases = m.nodes.filter((x) => isBaseNode(m, x)), bases0 = m0.nodes.filter((x) => isBaseNode(m0, x))
  ok(bases.length === bases0.length && bases.every((x) => near(x.z, h)) && !m.nodes.some((x) => x.z < h - 1e-9), `${tag}: same supports, nothing below the pedestal top`)
  const cons = Object.keys(buildGenPayloads(s, m).CONS).map(Number).sort((a, b) => a - b)
  ok(JSON.stringify(cons) === JSON.stringify(bases.map((x) => x.id).sort((a, b) => a - b)), `${tag}: Gen supports (CONS) = pedestal-top nodes`)
  ok(G.girtZsAt(0).every((z) => z > h) && G.endGirtZs.every((z) => z > h) && near(G.gWall, (s.eaveHeight - h) / G.nGirt), `${tag}: girts only above the pedestal, spacing from the pedestal top`)
  ok(m.elements.filter((e) => e.role === 'brace' && e.face !== 'roof').every((e) => [e.n1, e.n2].some((id) => near(m.nodes[id - 1].z, h))), `${tag}: wall braces land on the pedestal top`)
}
/* 풍 — 받침 아래 벽은 RC 가 받음: 풍상벽 수평 합력이 줄고(받침 아래 띠만큼), 지붕 상향력은 같음 */
{
  const m0 = buildPortal(DEFAULT_SPEC), m = buildPortal(ped)
  const w0 = windSummary(m0, buildLoadPayloads(DEFAULT_SPEC, m0)), w = windSummary(m, buildLoadPayloads(ped, m))
  const a = w0.rows.find((r) => r.name === 'WX1')!, b = w.rows.find((r) => r.name === 'WX1')!
  ok(b.horizontal < a.horizontal && b.horizontal > 0.8 * a.horizontal, `wind: WX1 horizontal ${a.horizontal.toFixed(1)} → ${b.horizontal.toFixed(1)} kN (wall below the pedestal goes to RC)`)
  ok(near(b.uplift, a.uplift, 1e-6), 'wind: roof uplift unchanged')
  ok(near(w.qh, w0.qh) && near(w.hRef, w0.hRef), 'wind: q(h) and reference height still from ground (wind code height above ground)')
  ok(w.profile!.rows.every((r) => r.z > h), 'wind profile: rows only above the pedestal')
}
/* 지진 — hn·높이 분배는 받침 윗면(강철 골조 기면) 기준, 받침 아래 벽 마감 무게 제외 */
{
  const L0 = buildLoadPayloads(DEFAULT_SPEC, buildPortal(DEFAULT_SPEC)), L = buildLoadPayloads(ped, buildPortal(ped))
  const G0 = portalGeometry(DEFAULT_SPEC)
  ok(L.info.seismic.W < L0.info.seismic.W, `seismic: W ${L0.info.seismic.W.toFixed(1)} → ${L.info.seismic.W.toFixed(1)} kN (no steel wall below the pedestal)`)
  ok(near(L.info.seismic.X.T, 0.085 * (G0.hMean - h) ** 0.75), 'seismic: period from steel height hn = hMean − pedestal')
  ok(near(steelHeight(ped), DEFAULT_SPEC.eaveHeight - h) && steelHeight(DEFAULT_SPEC) === DEFAULT_SPEC.eaveHeight, 'steel height = eave − pedestal')
}
/* 입력 — 기본 0 은 스펙에 안 씀, 높이가 있으면 {height, b, d} */
{
  const v = initVals(DEFAULT_SPEC)
  ok(v['pedestal.height'] === '0' && v['pedestal.b'] === '600' && toSpec(DEFAULT_SPEC, v, false).pedestal === undefined, 'input: default 0 → no pedestal in the spec')
  const sp = toSpec(DEFAULT_SPEC, { ...v, 'pedestal.height': '0.9', 'pedestal.b': '700', 'pedestal.d': '650' }, false)
  ok(JSON.stringify(sp.pedestal) === JSON.stringify({ height: 0.9, b: 700, d: 650 }), 'input: user pedestal kept')
  ok(toSpec(sp, { ...initVals(sp), 'pedestal.height': '0' }, false).pedestal === undefined, 'input: back to 0 removes the pedestal')
}
/* 적용범위 */
{
  const keys = (s: typeof DEFAULT_SPEC) => checkScope(s).issues.map((i) => `${i.level}:${i.key}`)
  ok(keys(ped).includes('warn:pedestal') && !checkScope(ped).blocked, 'scope: pedestal = expert-review warning, not blocked')
  ok(keys({ ...structuredClone(CN_DEFAULT_SPEC), pedestal: { height: 1, b: 600, d: 600 } }).includes('block:pedestalCode'), 'scope: pedestal blocked outside TW')
  ok(keys({ ...ped, pedestal: { height: 6.5, b: 600, d: 600 } }).includes('block:pedestalHigh'), 'scope: pedestal higher than eave − 2 m blocked')
  const add: any = { ...ped, features: { crane: true, mezzanine: false, multiSpan: false, opening: false }, additions: defaultAdditions(ped) }
  add.additions.crane = { id: 'CR1', elevation: 5.2, eccentricity: 0.3, wheelSpacing: 3, maxWheel: 45, minWheel: 10, impactFactor: 1.1, lateral: 0, braking: 0, seismicWeight: 30, driftLimitMm: 10, source: 'test', confirmed: true }
  ok(keys(add).includes('block:pedestalAdditions'), 'scope: pedestal + additions blocked (not yet supported)')
}
/* 강성 확인 — 캔틸레버 손계산 + 합성 결과로 비율 */
{
  const E = 4700 * Math.sqrt(27.5) * 1000, I = 0.7 * 0.6 ** 4 / 12, EI = E * I, Hs = 7
  const V = 20, M = 60, hp = 1
  const hand = V / (3 * EI) + M / (2 * EI) + (V / (2 * EI) + M / EI) * Hs
  ok(near(pedestalEaveDelta(V, M, hp, EI, Hs), hand), `stiffness: cantilever top displacement + rotation × steel height = ${(hand * 1000).toFixed(3)} mm`)
  const m = buildPortal(ped), L = buildLoadPayloads(ped, m)
  const nodes = new Map(m.nodes.map((x) => [x.id, x]))
  const baseCols = m.elements.filter((e) => e.role === 'column' && isBaseNode(m, nodes.get(e.n1)!))
  const combo = Object.keys(L.info.comboKind).find((c) => L.info.comboKind[c] === 'basic' && c.includes('WX1'))!
  const pt = { P: -50, Vy: 2, Vz: V, My: M, Mz: 3 }
  const res: any = { beam: new Map(baseCols.map((e) => [e.id, new Map([[combo, [pt, pt, pt, pt, pt]]])])), sway: new Map([[combo, { X: { sumPu: 0, drift: 0.02, sumH: 0 }, Y: { sumPu: 0, drift: 0.001, sumH: 0 } }]]) }
  const r = pedestalCheck(ped, m, L.info, res)!
  ok(r && near(r.summary.flex.X!.ratio, hand / 0.02) && r.service[0].key === 'pedestalX' && near(r.service[0].ratio, hand / 0.02 / 0.1), `stiffness: ratio X = ${(hand / 0.02).toFixed(4)} (limit 0.10)`)
  ok(r.summary.rows.find((x) => x.key === 'Mx')!.f.Mbase === M + V * hp && r.summary.rows.find((x) => x.key === 'Pc')!.f.P === -50, 'pedestal-top forces: bottom moment M + V·h, P + = tension')
  ok(pedestalCheck(DEFAULT_SPEC, buildPortal(DEFAULT_SPEC), L.info, res) === null, 'no pedestal → no check')
}
console.log(`Pedestal: ${n} checks passed (geometry, supports, girts, wind, seismic height, input, scope, stiffness)`)
