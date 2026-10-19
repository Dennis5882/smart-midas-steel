/* 대만 독립기초 예비검토 회귀 — 손계산 대조 (Gen·키 불필요)
   node --import tsx scripts/verify-tw-foundation.ts */
import assert from 'node:assert/strict'
;(globalThis as any).document = { documentElement: { lang: 'ko', dataset: {} } }
const { twFootings, serviceCombos, footingGroups, footingInputError, defaultFootingInput } = await import('../src/domain/twFoundation')
const { parseBaseReactions } = await import('../src/actions/analysis')
const { DEFAULT_SPEC, normalizeSpans } = await import('../src/domain/types')
const { buildPortal } = await import('../src/domain/portal')
const { buildLoadPayloads } = await import('../src/domain/loads')
let n = 0
const ok = (c: unknown, m: string) => { assert.ok(c, m); n++ }
const near = (a: number, b: number, tol: number, m: string) => ok(Math.abs(a - b) <= tol, `${m}: ${a} vs ${b}`)

/* 1. 주각 분류·조합 수 */
{
  const spec = structuredClone(DEFAULT_SPEC), model = buildPortal(spec), info = buildLoadPayloads(spec, model).info
  const g = footingGroups(model), cnt = (k: string) => [...g.values()].filter((v) => v === k).length
  ok(cnt('column') === 2 * (spec.bays + 1) && cnt('lean') === 0 && cnt('post') > 0, `TW sample bases: columns ${cnt('column')}, posts ${cnt('post')}`)
  ok(g.size === model.nodes.filter((p) => p.z === 0).length, 'every support classified')
  const cases = ['D', 'LR', 'EX', 'EY', 'ETX', 'ETY', ...info.wind.cases.map((c) => c.name), 'WLX', 'WLY', 'WT']
  const sc = serviceCombos(cases, info.wind.variants)
  ok(sc.length === 1 + 2 * (info.wind.variants.length + 8), `service combos ${sc.length} = 1 + 2 × (${info.wind.variants.length} wind + 8 seismic)`)
  ok(sc[0].term === 'long' && sc[0].parts.map((p) => p.lc).join() === 'D,LR' && sc.slice(1).every((c) => c.term === 'short'), 'long D+L, rest short')
  const gc = normalizeSpans({ ...structuredClone(DEFAULT_SPEC), frame: 'gableCols' as const, spanList: [16, 16] })
  ok([...footingGroups(buildPortal(gc)).values()].filter((v) => v === 'lean').length === gc.bays + 1, 'gableCols: interior column bases = lean group')
}

/* 2. 손계산 — 기둥 하나, 중심 하중: q = P/A + W/A ≤ qa */
const model = { nodes: [{ id: 1, x: 0, y: 0, z: 0 }, { id: 2, x: 0, y: 0, z: 6 }], elements: [{ id: 1, n1: 1, n2: 2, role: 'column', section: 'x' }] } as any
const spec = structuredClone(DEFAULT_SPEC)
const fi = { ...defaultFootingInput(), qa: 100, depth: 1.5, thickness: 0.6, friction: 0.4, soilGamma: 18, concreteGamma: 24 }
const w = 0.6 * 24 + 0.9 * 18 // 30.6 kN/m²
{
  const R = new Map([[1, new Map([['D', [0, 0, 100, 0, 0, 0]], ['LR', [0, 0, 50, 0, 0, 0]]])]])
  const r = twFootings(spec, model, ['D', 'LR'], [], R, fi)!
  ok(r && r.rows.length === 1 && r.combos === 1, 'concentric: one long-term combo')
  const row = r.rows[0]
  const A = row.B * row.L
  ok(row.ok && A >= 150 / (100 - w) - 1e-9 && A < 150 / (100 - w) + 0.12 && row.B >= row.L && row.B / row.L <= 1.5, `minimum area ≥ 150/(100−30.6) = 2.161: ${row.B} × ${row.L}`)
  near(row.ratios.bearing, (150 / A + w) / 100, 1e-9, 'q/qa = (150/A + 30.6)/100')
  near(row.N, 150 + w * A, 1e-9, 'N = P′ + W_S + W_F (4.1.1)')
  ok(row.ratios.eccentricity === 0 && row.ratios.sliding === 0, 'no moment / shear → 0')
}

/* 3. 손계산 — 지진 단기: 수평 반력 FX → 저면 모멘트 Df·FX, 유효면적 B′ = B − 2e (Meyerhof), 1.5qa, e ≤ B/3, 활동 FS 1.2 */
{
  const R = new Map([[1, new Map([['D', [0, 0, 120, 0, 0, 0]], ['EX', [15, 0, 0, 0, 8, 0]]])]])
  const r = twFootings(spec, model, ['D', 'EX'], [], R, fi)!
  const row = r.rows[0], A = row.B * row.L
  ok(r.combos === 1 + 2 * 2, 'D+L(=D) plus D±EX with/without L')
  const N = 120 + w * A, M = Math.abs(-1.5 * 15 - 8), e = M / N
  near(row.ratios.bearing, Math.max((120 + w * A) / A / 100, N / ((row.B - 2 * e) * row.L) / 150), 1e-9, 'bearing = max(long q/qa, short N/(B′L)/1.5qa)')
  near(row.ratios.eccentricity, e / (row.B / 3), 1e-9, 'e/(B/3) short-term (4.3.2)')
  near(row.ratios.sliding, 15 * 1.2 / (0.4 * N), 1e-9, 'sliding H·1.2/(N tanδ) (4.6)')
  ok(row.ok && Math.max(row.ratios.bearing, row.ratios.eccentricity, row.ratios.sliding) <= 1, 'chosen size passes all checks')
  /* 한 단계 작은 크기는 통과 못 함 (최소 크기 탐색) */
  const smaller = twFootings(spec, model, ['D', 'EX'], [], R, { ...fi, qa: fi.qa })!.rows[0]
  ok(smaller.B * smaller.L === A, 'deterministic size')
}

/* 4. 인발 — N ≤ 0 이면 크기 상한에서 NG */
{
  const R = new Map([[1, new Map([['D', [0, 0, 10, 0, 0, 0]], ['WX1', [0, 0, -2000, 0, 0, 0]]])]])
  const r = twFootings(spec, model, ['D', 'WX1'], [{ tag: 'WX1', parts: [{ lc: 'WX1', f: 1 }] }], R, fi)!
  ok(!r.ok && r.rows[0].B === 6 && !Number.isFinite(r.rows[0].ratios.bearing), 'net uplift beyond 6 m footing weight → NG')
}

/* 5. 입력·반력 표 해석 */
ok(footingInputError({ ...fi, depth: 0.5 }) === 'depth' && footingInputError({ ...fi, qa: 0 }) === 'qa' && !footingInputError(fi), 'input validation (Df ≥ t, qa > 0)')
ok(twFootings({ ...spec, code: 'CN' }, model, ['D'], [], new Map([[1, new Map([['D', [0, 0, 1, 0, 0, 0]]])]]), fi) === null, 'TW only')
{
  const rows = [['1', '1', 'D(ST)', '0', '0', '100', '0', '0', '0'], ['2', '1', 'LR(ST)', '1', '2', '50', '3', '4', '5'], ['3', '9', 'D(ST)', '0', '0', '1', '0', '0', '0']]
  const p = parseBaseReactions(rows, new Set([1]), new Set(['D', 'LR']))
  ok(p.get(1)?.get('LR')?.join() === '1,2,50,3,4,5' && !p.has(9), 'REACTIONG rows → node/case/6 components, (ST) stripped, other nodes ignored')
  ok(parseBaseReactions(rows.slice(0, 1), new Set([1]), new Set(['D', 'LR'])).size === 0, 'incomplete table → empty (check skipped)')
  ok(parseBaseReactions(undefined, new Set([1]), new Set(['D'])).size === 0, 'missing DATA → empty')
}
console.log(`TW foundation: ${n} checks passed`)
