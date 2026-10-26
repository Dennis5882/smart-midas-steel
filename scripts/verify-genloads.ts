/* Gen 엔지니어 하중 읽어 오기(F2 1단계) 오프라인 회귀 — 요약(합력·조합 이상·안내), 하중 정보, 가짜 Gen 흐름(읽기 → 확정 → 막힘), 정답 세트 결과로 설계 검토.
   실행: node --import tsx scripts/verify-genloads.ts */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
;(globalThis as any).document = { documentElement: { lang: 'ko', dataset: {} } }

type Db = Record<string, Record<string, any>>
let db: Db = {}
const { sectionAllTable } = await import('./fake-gen')
const json = (o: unknown) => new Response(JSON.stringify(o), { status: 200, headers: { 'content-type': 'application/json' } })
;(globalThis as any).fetch = async (url: string, init?: RequestInit) => {
  const path = new URL(url).pathname.replace(/^\/gen/, ''), method = init?.method ?? 'GET'
  const body = init?.body ? JSON.parse(String(init.body)) : {}
  if (path === '/doc/saveas') return json({ message: 'MIDAS GEN NX command complete' })
  if (path === '/doc/new') { db = {}; return json({}) }
  if (path === '/post/TABLE' && body.Argument?.TABLE_TYPE === 'SECTIONALL') return json(sectionAllTable(db.SECT, body.Argument.TABLE_NAME))
  if (path.startsWith('/doc/') || path.startsWith('/post/') || path.startsWith('/view/')) return json({})
  const name = path.replace('/db/', '')
  if (method === 'PUT') { db[name] = { ...db[name], ...body.Assign }; return json({ [name]: body.Assign }) }
  /* 없는 표는 오류로 답하는 Gen 도 가정 — 읽기는 '없음'으로 처리해야 함 */
  if (method === 'GET') return db[name] ? json({ [name]: structuredClone(db[name]) }) : new Response(JSON.stringify({ message: 'not found' }), { status: 400 })
  return json({})
}

const { S } = await import('../src/state/store')
const { setConfirmHandler } = await import('../src/components/ConfirmDialog')
setConfirmHandler(() => true)
const { DEFAULT_SPEC } = await import('../src/domain/types')
const { buildPortal } = await import('../src/domain/portal')
const { buildLoadPayloads } = await import('../src/domain/loads')
const { summarizeGenLoads, genLoadInfo, blockingComboIssues } = await import('../src/domain/genLoads')
const { runDesign } = await import('../src/domain/design')
const { buildFactory } = await import('../src/actions/build')
const { readGenLoads, acceptGenLoads, acceptUnavailable, readbackUnavailable } = await import('../src/actions/readback')
const { unavailable } = await import('../src/state/taskFlow')
const { checkScopeFor } = await import('../src/domain/scope')
const { decodeResults, FIXTURE } = await import('./tw-golden')

let n = 0
const ok = (c: unknown, what: string) => { n++; assert.ok(c, what) }
const near = (a: number, b: number, rel: number, what: string) => { n++; assert.ok(Math.abs(a - b) <= rel * Math.max(1, Math.abs(b)), `${what}: ${a} vs ${b}`) }

/* 1. 앱 자체 페이로드를 '엔지니어 하중'으로 읽으면 — 케이스·조합 수, 합력 = 앱 하중 */
const spec = structuredClone(DEFAULT_SPEC), model = buildPortal(spec), l = buildLoadPayloads(spec, model)
const sm = summarizeGenLoads(spec, model, l as any)
ok(sm.cases.length === Object.keys(l.STLD).length && sm.combos.length === Object.keys(l['LCOM-GEN']).length, `cases ${sm.cases.length} / combos ${sm.combos.length} = sent`)
ok(blockingComboIssues(sm).length === 0 && sm.opaque.length === 0 && sm.notices.length === 0, `app loads: no combo issues/notices (${sm.notices})`)
const caseOf = (name: string) => sm.cases.find((c) => c.name === name)!
const BL = spec.span * spec.bays * spec.baySpacing
near(caseOf('LR').sum.fz, -l.info.roofLive * BL, 1e-6, 'LR ΣFZ = −q·B·L')
near(Math.abs(caseOf('EX').sum.fx), l.info.seismic.X.V, 1e-6, 'EX ΣFX = V_X')
ok(!caseOf('LR').approx && caseOf('D').counts.self === 1, 'beam/nodal exact, D has self weight')
/* 자중 추정 + 마감 = Gen D 반력 (정답 세트, 라이브) */
const fx = JSON.parse(gunzipSync(readFileSync(FIXTURE)).toString())
const genD = fx.reactions.find((r: any) => r.lc === 'D').fz
near(-caseOf('D').sum.fz, genD, 0.01, 'D ΣFZ (self-weight estimate + finishes) ≈ Gen D reaction')

/* 2. 보 하중 형식 — 상대/절대 위치, 집중, 투영, 국부 방향 */
const e = model.elements.find((x) => x.role === 'rafter')!, nd = new Map(model.nodes.map((v) => [v.id, v]))
const a = nd.get(e.n1)!, b = nd.get(e.n2)!, L = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z), Lh = Math.hypot(b.x - a.x, b.y - a.y)
const one = (it: any) => summarizeGenLoads(spec, model, { STLD: { 1: { NAME: 'T', TYPE: 'L' } }, BMLD: { [e.id]: { ITEMS: [{ ID: 1, LCNAME: 'T', CMD: 'BEAM', ...it }] } } }).cases[0]
near(one({ TYPE: 'UNILOAD', DIRECTION: 'GZ', D: [0, 1, 0, 0], P: [-2, -2, 0, 0] }).sum.fz, -2 * L, 1e-9, 'UNILOAD relative full span')
near(one({ TYPE: 'UNILOAD', DIRECTION: 'GZ', D: [0, 0.5, 0, 0], P: [-2, -4, 0, 0] }).sum.fz, -3 * L / 2, 1e-9, 'UNILOAD trapezoid half span')
near(one({ TYPE: 'UNILOAD', DIRECTION: 'GZ', D: [1, 3, 0, 0], P: [-1, -1, 0, 0] }).sum.fz, -2, 1e-9, 'UNILOAD absolute distance (m)')
near(one({ TYPE: 'CONLOAD', DIRECTION: 'GX', D: [0.3, 0.6, 0, 0], P: [5, 7, 0, 0] }).sum.fx, 12, 1e-9, 'CONLOAD point loads')
near(one({ TYPE: 'UNILOAD', DIRECTION: 'GZ', USE_PROJECTION: true, D: [0, 1, 0, 0], P: [-1, -1, 0, 0] }).sum.fz, -Lh, 1e-9, 'GZ projected length')
const loc = one({ TYPE: 'UNILOAD', DIRECTION: 'LZ', D: [0, 1, 0, 0], P: [-1, -1, 0, 0] })
ok(loc.approx && loc.counts.local === 1 && loc.sum.fz === 0, 'local direction → counted, approximate')

/* 3. 조합 이상·안내 */
const bad = summarizeGenLoads(spec, model, {
  STLD: { 1: { NAME: 'D', TYPE: 'D' }, 2: { NAME: 'L1', TYPE: 'L' }, 3: { NAME: 'X', TYPE: 'L' } },
  BODF: { 1: { LCNAME: 'D', FV: [0, 0, -1] } },
  'LCOM-GEN': { 1: { NAME: 'C1', vCOMB: [{ ANAL: 'ST', LCNAME: 'D', FACTOR: 1.2 }, { ANAL: 'ST', LCNAME: 'L1', FACTOR: 0 }] }, 2: { NAME: 'C1', vCOMB: [{ ANAL: 'ST', LCNAME: 'NOPE', FACTOR: 1 }] }, 3: { NAME: 'C3', vCOMB: [] }, 4: { NAME: 'C4', vCOMB: [{ ANAL: 'CB', LCNAME: 'C1', FACTOR: 1 }] } },
  SWIND: { 1: { foo: 1 } },
})
const iss = (name: string, i: number) => bad.combos.filter((c) => c.name === name)[i].issues.join()
ok(iss('C1', 0) === 'zeroFactor' && iss('C1', 1) === 'duplicate,unknownCase' && iss('C3', 0) === 'empty' && iss('C4', 0) === 'nonStatic', `combo issues ${bad.combos.map((c) => c.issues.join('/'))}`)
ok(blockingComboIssues(bad).length === 3, 'zero factor alone does not block')
ok(bad.opaque.join() === 'SWIND' && bad.notices.includes('noSeismic') && !bad.notices.includes('noWind') && bad.unused.join() === 'X' && bad.notices.includes('unusedCase') && !bad.notices.includes('noLoads'), `notices ${bad.notices} unused ${bad.unused}`)

/* 4. 하중 정보 — 모든 조합 basic, 풍 변형 방향, 활하중·지진 케이스 */
const gi = genLoadInfo(l.info, sm)
ok(Object.values(gi.comboKind).every((k) => k === 'basic') && Object.keys(gi.comboKind).length === sm.combos.length, 'all combos basic')
ok(gi.wind.variants.find((v) => v.tag === 'WX1')?.dir === 'X' && gi.wind.variants.find((v) => v.tag === 'WY1')?.dir === 'Y', 'wind variant directions from resultants')
ok(gi.gen!.liveCases.join() === 'LR' && gi.gen!.seismicCases.find((c) => c.name === 'EX')?.dir === 'X' && gi.gen!.seismicCases.find((c) => c.name === 'EY')?.dir === 'Y', 'live / seismic cases')
ok(checkScopeFor(spec, gi).issues.some((i) => i.key === 'genLoads' && i.level === 'warn') && !checkScopeFor(spec, l.info).issues.some((i) => i.key === 'genLoads'), 'scope warn genLoads only with engineer loads')

/* 5. 정답 세트 결과로 설계 검토 — 엔지니어 하중 정보로도 검증·검토가 돈다, 지진 변위각 없음, 풍 변위각·지붕 처짐 있음 */
const res = decodeResults(fx.results)
const d = runDesign(spec, model, gi, res)
const keys = d.service.map((s) => s.key)
ok(d.members.length === model.elements.length && keys.includes('windDriftX') && keys.includes('rafterDefl') && !keys.some((k) => k.startsWith('seisDrift')), `design with engineer info: service ${keys}`)

/* 6. 가짜 Gen 흐름 — 모델 + 자중만 → 엔지니어가 Gen 에 하중 입력 → 읽기 → 확정 */
S.mapiKey = 'k'
await buildFactory(spec, { modelOnly: true })
ok(S.built?.modelOnly && unavailable(S, 'analysis') === 'flow_model_only', 'model-only build blocks analysis')
db.STLD = { ...db.STLD, 2: { NAME: 'LIVE', TYPE: 'LR', DESC: '' }, 3: { NAME: 'WIND', TYPE: 'W', DESC: '' } }
const rafter = model.elements.find((x) => x.role === 'rafter')!.id, girt = model.elements.find((x) => x.role === 'girt')!.id
db.BMLD = { [rafter]: { ITEMS: [{ ID: 1, LCNAME: 'LIVE', CMD: 'BEAM', TYPE: 'UNILOAD', DIRECTION: 'GZ', D: [0, 1, 0, 0], P: [-3, -3, 0, 0] }] }, [girt]: { ITEMS: [{ ID: 1, LCNAME: 'WIND', CMD: 'BEAM', TYPE: 'UNILOAD', DIRECTION: 'GX', D: [0, 1, 0, 0], P: [1, 1, 0, 0] }] } }
db['LCOM-GEN'] = { 1: { NAME: '1.2D+1.6LR', ACTIVE: 'ACTIVE', iTYPE: 0, vCOMB: [{ ANAL: 'ST', LCNAME: 'D', FACTOR: 1.2 }, { ANAL: 'ST', LCNAME: 'LIVE', FACTOR: 1.6 }] }, 2: { NAME: '1.2D+1.6W', ACTIVE: 'ACTIVE', iTYPE: 0, vCOMB: [{ ANAL: 'ST', LCNAME: 'D', FACTOR: 1.2 }, { ANAL: 'ST', LCNAME: 'WIND', FACTOR: 1.6 }] } }
await readGenLoads()
ok(S.genRead && S.genRead.summary.cases.length === 3 && S.genRead.summary.combos.length === 2 && acceptUnavailable() === null, `read: ${S.genRead?.summary.cases.map((c) => c.name)}`)
ok(S.genRead!.summary.notices.join() === 'noSeismic', `notices ${S.genRead!.summary.notices}`)
acceptGenLoads()
const B = S.built!
ok(B.genLoads && !B.modelOnly && B.comboNames.join() === '1.2D+1.6LR,1.2D+1.6W' && B.cases.join() === 'D,LIVE,WIND' && B.info.gen?.liveCases.join() === 'LIVE', 'accepted: built uses engineer cases and combos')
ok(B.sent?.BMLD === undefined || Object.keys(B.sent!.BMLD).length === 2, 'sent load tables = what was read')
ok(unavailable(S, 'analysis') === null && unavailable({ ...S, analyzed: true, design: {} as any, connections: [] }, 'optimize') === 'flow_gen_loads_opt', 'analysis allowed, optimize blocked')
/* Gen 에서 형상이 바뀌면 읽기를 막음 */
const elem = Object.keys(db.ELEM)[0]
db.ELEM[elem] = { ...db.ELEM[elem], SECT: 99 }
await readGenLoads()
ok(S.genRead === null && S.genChanged > 0, 'geometry change in Gen blocks reading')
ok(readbackUnavailable({ ...B, spec: { ...B.spec, code: 'CN' } }) === 'rb_code', 'TW only')

console.log(`Gen readback: ${n} checks passed (summary sums, beam load forms, combo issues, notices, info, design, fake-Gen flow)`)
