/* 순정 모드 결과 회수 — 케이스(ST) 결과 × 조합 계수의 합 = Gen 조합(CB) 결과 (선형 정적). 가짜 Gen 이 케이스 값을 무작위로 정하고
   조합 표는 그 선형 합으로 답한다 → fetchResults(케이스 조합) 와 fetchResults(mode 'combos') 의 부재력·가새 축력(I/J 따로 합한 뒤 고름)·B2 입력·
   사용성 변위·지문 재사용이 같아야 한다. 엔지니어 하중(F2)·선형 합이 아닌 조합은 조합 결과를 그대로 읽는다.
   실행: node --import tsx scripts/verify-case-combo.ts */
import assert from 'node:assert/strict'
;(globalThis as any).document = { documentElement: { lang: 'ko', dataset: {} } }
const { S } = await import('../src/state/store')
const { DEFAULT_SPEC, KR_DEFAULT_SPEC } = await import('../src/domain/types')
const { buildPortal } = await import('../src/domain/portal')
const { buildLoadPayloads } = await import('../src/domain/loads')
const { fetchResults, reusableResults, checkResults, caseCombination } = await import('../src/actions/results')
type Built = import('../src/state/store').Built

let passed = 0
/* mapi 가 처음 fetch 를 잡아 두므로 한 번만 바꾸고 기준별 응답은 handler 로 */
let handler: (init?: RequestInit) => Promise<Response> = async () => Response.json({})
;(globalThis as any).fetch = (_url: string, init?: RequestInit) => handler(init)
const ok = (c: unknown, what: string) => { passed++; assert.ok(c, what) }

/* 결정적 의사 난수 — 같은 (키) 는 같은 값 */
const rnd = (key: string) => { let h = 2166136261; for (const ch of key) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return ((h >>> 0) % 20001) / 100 - 100 }
const PARTS = ['I[1]', '1/4', '2/4', '3/4', 'J[2]']

function setup(spec: any) {
  const model = buildPortal(spec), l = buildLoadPayloads(spec, model)
  const comboNames = Object.values(l['LCOM-GEN']).map((c: any) => c.NAME), cases = Object.values(l.STLD).map((c: any) => c.NAME)
  const built: Built = { spec, model, info: l.info, cases, comboNames, combos: comboNames.length, sent: { 'LCOM-GEN': l['LCOM-GEN'] } }
  const parts = new Map(Object.values(l['LCOM-GEN']).map((c: any) => [c.NAME, c.vCOMB.map((p: any) => [p.LCNAME, p.FACTOR] as [string, number])]))
  /* 케이스 값, 조합 값 = Σ 계수 × 케이스 값 */
  const val = (load: string, key: string): number => {
    const m = /^(.*)\((ST|CB)\)$/.exec(load)!
    if (m[2] === 'ST') return rnd(`${m[1]}|${key}`)
    return parts.get(m[1])!.reduce((s, [lc, f]) => s + f * rnd(`${lc}|${key}`), 0)
  }
  const calls: string[] = []
  handler = async (init?: RequestInit) => {
    const a = JSON.parse(String(init?.body ?? '{}')).Argument
    const keys: number[] = a.NODE_ELEMS.KEYS, loads: string[] = a.LOAD_CASE_NAMES
    calls.push(`${a.TABLE_TYPE}:${loads.length}:${loads[0]}`)
    const label = (x: string) => x.replace(/\((ST|CB)\)$/, '')
    const data: unknown[][] = []
    if (a.TABLE_TYPE === 'BEAMFORCE') for (const id of keys) for (const c of loads) PARTS.forEach((pt, i) => data.push(['0', id, label(c), pt, ...['P', 'Vy', 'Vz', 'My', 'Mz'].map((k) => val(c, `b${id}.${i}.${k}`))]))
    else if (a.TABLE_TYPE === 'TRUSSFORCE') for (const id of keys) for (const c of loads) data.push(['0', id, label(c), val(c, `t${id}.i`), val(c, `t${id}.j`)])
    else if (a.TABLE_TYPE === 'REACTIONG') return Response.json({ [a.TABLE_NAME]: { SUB_TABLES: [{ 'SUMMATION OF REACTION FORCES PRINTOUT': { DATA: loads.map((c) => [label(c), val(c, 'rx'), val(c, 'ry'), val(c, 'rz')]) } }] } })
    else if (a.TABLE_TYPE === 'DISPLACEMENTG') for (const id of keys) for (const c of loads) data.push(['0', id, label(c), val(c, `d${id}.x`) / 1e4, val(c, `d${id}.y`) / 1e4, val(c, `d${id}.z`) / 1e4])
    return Response.json({ [a.TABLE_NAME]: { HEAD: [], DATA: data } })
  }
  return { built, calls }
}

const near = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b))
S.mapiKey = 'k'
for (const [code, spec] of [['TW', DEFAULT_SPEC], ['KR', KR_DEFAULT_SPEC]] as const) {
  S.code = code
  const { built, calls } = setup(structuredClone(spec))
  ok(caseCombination(built)?.size === built.comboNames.length, `${code}: app combinations are linear case sums`)
  calls.length = 0
  const rc = await fetchResults(built)
  const caseCalls = calls.filter((c) => c.startsWith('BEAMFORCE'))
  ok(caseCalls.every((c) => c.endsWith('(ST)')) && caseCalls.reduce((s, c) => s + +c.split(':')[1], 0) === new Set([...caseCombination(built)!.values()].flatMap((p) => p.map((x) => x.lc))).size,
    `${code}: BEAMFORCE read per case (${caseCalls})`)
  calls.length = 0
  const rg = await fetchResults(built, { mode: 'combos' })
  ok(calls.filter((c) => c.startsWith('BEAMFORCE')).every((c) => c.endsWith('(CB)')), `${code}: mode combos reads combination tables`)
  let worst = 0, n = 0
  for (const [id, m] of rg.beam) for (const [c, pts] of m) pts.forEach((p, i) => { const q = rc.beam.get(id)!.get(c)![i]; for (const k of ['P', 'Vy', 'Vz', 'My', 'Mz'] as const) { n++; if (!near(q[k], p[k])) worst = Math.max(worst, Math.abs(q[k] - p[k])) } })
  ok(worst === 0 && n > 0, `${code}: beam forces from case sums = combination tables (${n} values, worst ${worst})`)
  ok([...rg.truss].every(([id, m]) => [...m].every(([c, f]) => near(rc.truss.get(id)!.get(c)!, f))) && rg.truss.size > 0, `${code}: brace force (I/J summed, then larger) = combination tables`)
  ok([...rg.sway].every(([c, s]) => (['X', 'Y'] as const).every((d) => near(rc.sway.get(c)![d].sumPu, s[d].sumPu) && near(rc.sway.get(c)![d].sumH, s[d].sumH) && near(rc.sway.get(c)![d].drift, s[d].drift))), `${code}: B2 inputs (reaction sums, eave drift) equal`)
  ok([...rg.disp].every(([c, m]) => [...m].every(([nd, v]) => near(rc.disp.get(c)!.get(nd)!.dx, v.dx))), `${code}: service displacements equal`)
  /* 지문 재사용 — 케이스 표로 만든 지문은 케이스 표로 다시 확인 */
  checkResults(built, rc)
  calls.length = 0
  ok(await reusableResults(rc, built, S.analysisRev) === rc && calls.every((c) => c.endsWith('(ST)')), `${code}: fingerprint re-read from case tables (${calls})`)
}
/* 조합 결과를 그대로 읽는 경우 — 엔지니어 하중, 선형 합이 아닌 조합(iTYPE ≠ 0), 정적 케이스가 아닌 항 */
{
  const { built } = setup(structuredClone(DEFAULT_SPEC))
  ok(caseCombination({ ...built, genLoads: {} as any }) === null, 'engineer loads → combination tables')
  const lc = structuredClone(built.sent!['LCOM-GEN']) as any, first = Object.keys(lc)[0]
  lc[first].iTYPE = 1
  ok(caseCombination({ ...built, sent: { 'LCOM-GEN': lc } }) === null, 'envelope / SRSS combination → combination tables')
  const lc2 = structuredClone(built.sent!['LCOM-GEN']) as any
  lc2[first].vCOMB[0].ANAL = 'CB'
  ok(caseCombination({ ...built, sent: { 'LCOM-GEN': lc2 } }) === null, 'combination of combinations → combination tables')
}
console.log(`Case-sum results: ${passed} checks passed (TW/KR case sums = combination tables, brace I/J, B2, service, fingerprint, fallbacks)`)
