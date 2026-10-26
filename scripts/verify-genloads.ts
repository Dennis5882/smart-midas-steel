/* Gen 엔지니어 하중 읽어 오기(F2 1단계) 오프라인 회귀 — 요약(합력·조합 이상·안내), 하중 정보, 가짜 Gen 흐름(읽기 → 확정 → 막힘), 정답 세트 결과로 설계 검토.
   실행: node --import tsx scripts/verify-genloads.ts */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
;(globalThis as any).document = { documentElement: { lang: 'ko', dataset: {} } }

type Db = Record<string, Record<string, any>>
let db: Db = {}
const calls: string[] = []
/** 이 표 PUT 을 실패로 답함 (단면 갱신 중간 실패) */
let failPut = ''
const { sectionAllTable } = await import('./fake-gen')
const json = (o: unknown) => new Response(JSON.stringify(o), { status: 200, headers: { 'content-type': 'application/json' } })
;(globalThis as any).fetch = async (url: string, init?: RequestInit) => {
  const path = new URL(url).pathname.replace(/^\/gen/, ''), method = init?.method ?? 'GET'
  const body = init?.body ? JSON.parse(String(init.body)) : {}
  calls.push(`${method} ${path}`)
  if (path === '/doc/saveas') return json({ message: 'MIDAS GEN NX command complete' })
  if (path === '/doc/new') { db = {}; return json({}) }
  if (path === '/post/TABLE' && body.Argument?.TABLE_TYPE === 'SECTIONALL') return json(sectionAllTable(db.SECT, body.Argument.TABLE_NAME))
  if (path.startsWith('/doc/') || path.startsWith('/post/') || path.startsWith('/view/')) return json({})
  const name = path.replace('/db/', '')
  if (method === 'PUT' && name === failPut) return new Response(JSON.stringify({ message: 'failed' }), { status: 400 })
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
const { reviewGenSections, SectionUpdateError } = await import('../src/domain/genSections')
const { buildGenPayloads } = await import('../src/domain/gen')
const { assertGenSync } = await import('../src/actions/genSync')
const { runDesign } = await import('../src/domain/design')
const { runConnections } = await import('../src/domain/connections')
const { buildFactory } = await import('../src/actions/build')
const { readGenLoads, acceptGenLoads, acceptUnavailable, readbackUnavailable, setComboKind } = await import('../src/actions/readback')
const { resendModel } = await import('../src/actions/build')
const { t } = await import('../src/i18n')
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
/* 3b. 이름 표시 없이 지진 계수 > 1 → 일반으로 추정(부재 검토에서 빠지지 않게) + 안내, 토압(EH)은 지진 아님, 이름에 ′ → 증폭 */
const E = (lc: string, f: number) => ({ ANAL: 'ST', LCNAME: lc, FACTOR: f })
const sf = summarizeGenLoads(spec, model, {
  STLD: { 1: { NAME: 'D', TYPE: 'D' }, 2: { NAME: 'EX', TYPE: 'E' }, 3: { NAME: 'EP', TYPE: 'EH' } },
  'LCOM-GEN': { 1: { NAME: '1.2D+1.25EX', vCOMB: [E('D', 1.2), E('EX', 1.25)] }, 2: { NAME: '1.2D+1.6EP', vCOMB: [E('D', 1.2), E('EP', 1.6)] }, 3: { NAME: "1.2D+E'X", vCOMB: [E('D', 1.2), E('EX', 2.8)] } },
})
const kOf = (name: string) => sf.combos.find((c) => c.name === name)!
ok(kOf('1.2D+1.25EX').kind === 'basic' && kOf('1.2D+1.25EX').issues.join() === 'seismicFactor' && kOf('1.2D+1.6EP').kind === 'basic' && !kOf('1.2D+1.6EP').issues.length && kOf("1.2D+E'X").kind === 'amplified' && !kOf("1.2D+E'X").issues.length,
  `seismic factor > 1 without mark → basic + notice; EH not seismic (${sf.combos.map((c) => `${c.name}:${c.kind}/${c.issues}`)})`)
ok(blockingComboIssues(sf).length === 0 && genLoadInfo(l.info, sf).gen!.seismicCases.map((c) => c.name).join() === 'EX', 'seismicFactor does not block; seismic cases = type E only')
/* 3c. 트러스 하현재·웨브를 비워 두면 Gen 의 기본 단면과 같음 — 가짜 변경 아님 */
{
  const ts = { ...structuredClone(spec), frame: 'truss' as const, sections: { ...spec.sections, chord: undefined, web: undefined } }
  const tm = buildPortal(ts), tp = buildGenPayloads(ts, tm), rv = reviewGenSections(ts, tm, tp.SECT, tp.ELEM)
  ok(rv.ok && rv.changes.length === 0, `truss default chord/web not a change (${rv.ok ? JSON.stringify(rv.changes) : rv.reason})`)
}

/* 4. 하중 정보 — 모든 조합 basic, 풍 변형 방향, 활하중·지진 케이스 */
const gi = genLoadInfo(l.info, sm)
ok(Object.keys(gi.comboKind).length === sm.combos.length && Object.entries(gi.comboKind).every(([c, k]) => k === l.info.comboKind[c]), 'combo kinds = guessed (= app)')
ok(gi.wind.variants.find((v) => v.tag === 'WX1')?.dir === 'X' && gi.wind.variants.find((v) => v.tag === 'WY1')?.dir === 'Y', 'wind variant directions from resultants')
ok(gi.gen!.liveCases.join() === 'LR' && gi.gen!.seismicCases.find((c) => c.name === 'EX')?.dir === 'X' && gi.gen!.seismicCases.find((c) => c.name === 'EY')?.dir === 'Y', 'live / seismic cases')
ok(checkScopeFor(spec, gi).issues.some((i) => i.key === 'genLoads' && i.level === 'warn') && !checkScopeFor(spec, l.info).issues.some((i) => i.key === 'genLoads'), 'scope warn genLoads only with engineer loads')

/* 4b. 2단계 조합 용도 추정 — 앱 자체 조합(일반·증폭 지진 E′·13.6.1 중력)에 적용하면 앱이 붙인 용도와 같다 (ASD 선택 스펙 포함) */
for (const sp of [spec, { ...structuredClone(spec), asd: true }]) {
  const m2 = buildPortal(sp), l2 = buildLoadPayloads(sp, m2), s2 = summarizeGenLoads(sp, m2, l2 as any)
  const wrong = s2.combos.filter((c) => c.kind !== l2.info.comboKind[c.name]).map((c) => `${c.name}:${c.kind}/${l2.info.comboKind[c.name]}`)
  ok(wrong.length === 0 && new Set(s2.combos.map((c) => c.kind)).size >= (sp.asd ? 4 : 3), `guessed kinds = app kinds${sp.asd ? ' (ASD)' : ''} (${wrong.slice(0, 3)})`)
  if (!sp.asd) {
    const gi2 = genLoadInfo(l2.info, s2)
    ok(Math.abs(gi2.omega.X - l2.info.omega.X) < 1e-9 && Math.abs(gi2.omega.Y - l2.info.omega.Y) < 1e-9, `Ω from amplified combos ${gi2.omega.X}/${gi2.omega.Y} = app ${l2.info.omega.X}/${l2.info.omega.Y}`)
  }
}

/* 5. 정답 세트 결과로 설계 검토 — 엔지니어 하중 정보로도 검증·검토가 돈다, 지진 변위각 없음, 풍 변위각·지붕 처짐 있음 */
const res = decodeResults(fx.results)
const d = runDesign(spec, model, gi, res)
const keys = d.service.map((s) => s.key)
ok(d.members.length === model.elements.length && keys.includes('windDriftX') && keys.includes('rafterDefl') && !keys.some((k) => k.startsWith('seisDrift')), `design with engineer info: service ${keys}`)
/* 용도까지 앱과 같으면 부재 강도비 = 앱 원래 검토, 접합도 같은 종류·처마 13.6.1 회전 메모 */
const dApp = runDesign(spec, model, l.info, res)
const memDiff = Math.max(...dApp.members.map((m, i) => Math.abs(m.ratio - d.members[i].ratio)))
ok(memDiff < 1e-12, `engineer-load member ratios = app (max |Δ| ${memDiff})`)
const cGen = runConnections(spec, model, gi, res), cApp = runConnections(spec, model, l.info, res)
ok(cGen.map((c) => c.type).join() === cApp.map((c) => c.type).join() && cGen.find((c) => c.type === 'knee')?.notes.includes('rotTest') && Math.abs(cGen.find((c) => c.type === 'base')!.ratio - cApp.find((c) => c.type === 'base')!.ratio) < 1e-12,
  `connections: types ${cGen.map((c) => c.type)}, knee 13.6.1 rotTest, base ratio = app`)
/* 엔지니어 지진 케이스는 V/V* 를 몰라 θE 를 쓰지 않음 — 소요 소성 회전각은 상한만 */
ok(String(cGen.find((c) => c.type === 'knee')?.dims.thetaP).startsWith('θp,req ≤ 0.0100') && /θE =/.test(String(cApp.find((c) => c.type === 'knee')?.dims.thetaP)), 'engineer loads: θp,req upper bound only (no θE)')

/* 6. 가짜 Gen 흐름 — 모델 + 자중만 → 엔지니어가 Gen 에 하중 입력 → 읽기 → 확정 */
S.mapiKey = 'k'
await buildFactory(spec, { modelOnly: true })
ok(S.built?.modelOnly && unavailable(S, 'analysis') === 'flow_model_only', 'model-only build blocks analysis')
db.STLD = { ...db.STLD, 2: { NAME: 'LIVE', TYPE: 'LR', DESC: '' }, 3: { NAME: 'WIND', TYPE: 'W', DESC: '' } }
const rafter = model.elements.find((x) => x.role === 'rafter')!.id, girt = model.elements.find((x) => x.role === 'girt')!.id
db.BMLD = { [rafter]: { ITEMS: [{ ID: 1, LCNAME: 'LIVE', CMD: 'BEAM', TYPE: 'UNILOAD', DIRECTION: 'GZ', D: [0, 1, 0, 0], P: [-3, -3, 0, 0] }] }, [girt]: { ITEMS: [{ ID: 1, LCNAME: 'WIND', CMD: 'BEAM', TYPE: 'UNILOAD', DIRECTION: 'GX', D: [0, 1, 0, 0], P: [1, 1, 0, 0] }] } }
db.SWIND = { 1: { foo: 1 } } // 엔지니어 풍하중 표 (합산 못 함 — 단면 갱신 후에도 남아야 함)
db['LCOM-GEN'] = { 1: { NAME: '1.2D+1.6LR', ACTIVE: 'ACTIVE', iTYPE: 0, vCOMB: [{ ANAL: 'ST', LCNAME: 'D', FACTOR: 1.2 }, { ANAL: 'ST', LCNAME: 'LIVE', FACTOR: 1.6 }] }, 2: { NAME: '1.2D+1.6W', ACTIVE: 'ACTIVE', iTYPE: 0, vCOMB: [{ ANAL: 'ST', LCNAME: 'D', FACTOR: 1.2 }, { ANAL: 'ST', LCNAME: 'WIND', FACTOR: 1.6 }] } }
await readGenLoads()
ok(S.genRead && S.genRead.summary.cases.length === 3 && S.genRead.summary.combos.length === 2 && acceptUnavailable() === null, `read: ${S.genRead?.summary.cases.map((c) => c.name)}`)
ok(S.genRead!.summary.notices.join() === 'noSeismic' && S.genRead!.summary.opaque.join() === 'SWIND', `notices ${S.genRead!.summary.notices}`)
setComboKind('1.2D+1.6W', 'gravity') // 엔지니어가 고친 용도 — 단면 갱신 후에도 유지
acceptGenLoads()
const B = S.built!
ok(B.genLoads && !B.modelOnly && B.comboNames.join() === '1.2D+1.6LR,1.2D+1.6W' && B.cases.join() === 'D,LIVE,WIND' && B.info.gen?.liveCases.join() === 'LIVE', 'accepted: built uses engineer cases and combos')
ok(B.sent?.BMLD === undefined || Object.keys(B.sent!.BMLD).length === 2, 'sent load tables = what was read')
ok(B.genLoads!.combos.find((c) => c.name === '1.2D+1.6W')?.kind === 'gravity' && B.info.comboKind['1.2D+1.6W'] === 'gravity', 'summary and info carry the confirmed purpose')
ok(unavailable(S, 'analysis') === null && unavailable({ ...S, analyzed: true, design: {} as any, connections: [] }, 'optimize') === null, 'analysis and optimize allowed')
/* 2단계: 단면만 바꾸기 — doc/new 없이 SECT·ELEM 만, 엔지니어 하중·번호 유지 */
{
  const loadsBefore = JSON.stringify([db.BMLD, db['LCOM-GEN'], db.STLD]), newCol = 'RH 500x200x10x16'
  calls.length = 0
  const next = { ...B.spec, sections: { ...B.spec.sections, column: newCol } }
  await resendModel(next)
  const B2 = S.built!
  const colSect = Object.entries(db.SECT).find(([, v]: any) => v.SECT_NAME.replace(/\s/g, '') === newCol.replace(/\s/g, ''))?.[0]
  const colElem = B2.model.elements.find((x) => x.role === 'column')!.id
  ok(!calls.some((c) => c.includes('/doc/new')) && calls.filter((c) => c.startsWith('PUT')).map((c) => c.split('/').pop()).join() === 'SECT,ELEM', `section-only update: PUT ${calls.filter((c) => c.startsWith('PUT'))}`)
  ok(JSON.stringify([db.BMLD, db['LCOM-GEN'], db.STLD]) === loadsBefore && B2.genLoads && B2.comboNames.join() === '1.2D+1.6LR,1.2D+1.6W', 'engineer loads and combos kept')
  ok(colSect && String(db.ELEM[colElem].SECT) === colSect && B2.spec.sections.column === newCol && !S.analyzed, `column element now ${newCol}, results cleared`)
  ok(B2.sent!.SECT === undefined || Object.keys(B2.sent!.SECT).length >= Object.keys(db.SECT).length - 0, 'sent SECT = read back (old ids allowed)')
  ok(B2.genLoads!.opaque.join() === 'SWIND' && B2.genLoads!.notices.join() === 'noSeismic' && B2.info.comboKind['1.2D+1.6W'] === 'gravity' && B2.genLoads!.combos.find((c) => c.name === '1.2D+1.6W')?.kind === 'gravity',
    `after update: opaque tables, notices and confirmed purposes kept (${B2.genLoads!.opaque} / ${B2.genLoads!.notices})`)
  let geoErr: unknown
  try { await resendModel({ ...next, span: next.span + 2 }) } catch (e) { geoErr = e }
  ok(geoErr instanceof SectionUpdateError && geoErr.dbs.includes('NODE'), `geometry change refused for section-only update (${geoErr})`)
  /* 단면 갱신 중간 실패 — 이전 결과가 지금 모델의 결과로 남지 않음 (S.built 새 객체·결과 비움) */
  S.design = {} as any; S.analyzed = true
  failPut = 'ELEM'
  let midErr: unknown
  try { await resendModel({ ...next, sections: { ...next.sections, column: 'RH 600x200x11x17' } }) } catch (e) { midErr = e }
  failPut = ''
  ok(midErr && S.built !== B2 && S.design === null && !S.analyzed && S.built!.spec.sections.column === newCol, 'failed section update clears results and replaces built')
  /* 원래대로: 다시 보내 동일성 기준을 맞춘다 */
  await resendModel(next)
  ok(S.built!.spec.sections.column === newCol, 'section update after a failure')
}
/* 2단계 C: 엔지니어가 Gen 에서 단면을 바꿈 — 역할마다 한 단면·목록 안·같은 정의면 받아들임, 아니면 이유와 함께 막음 */
{
  const B3 = S.built!, cols = B3.model.elements.filter((x) => x.role === 'column').map((x) => x.id)
  const sidOf = (name: string) => Object.entries(db.SECT).find(([, v]: any) => v.SECT_NAME === name.replace(/\s/g, ''))?.[0]
  const old600 = sidOf('RH 600x200x11x17')!
  ok(!!old600, 'old column section id still in Gen (left after section-only update)')
  const elemBak = structuredClone(db.ELEM), sectBak = structuredClone(db.SECT)
  for (const id of cols) db.ELEM[id].SECT = +old600
  await readGenLoads()
  const ch = S.genRead?.sections?.changes ?? []
  ok(ch.length === 1 && ch[0].role === 'column' && ch[0].to === 'RH 600x200x11x17' && ch[0].count === cols.length, `engineer column change detected (${JSON.stringify(ch)})`)
  acceptGenLoads()
  ok(S.built!.spec.sections.column === 'RH 600x200x11x17' && S.built!.genLoads && S.activePlan?.spec.sections.column === 'RH 600x200x11x17' && unavailable(S, 'analysis') === null, 'accepted: app spec, editor and analysis use the engineer section')
  /* 같은 역할에서 섞임 → 막음 */
  db.ELEM[cols[0]].SECT = +sidOf('RH 500x200x10x16')!
  await readGenLoads()
  ok(S.genRead === null && String((S.msgs.at(-1) as any)?.html).includes(t('rb_sect_mixed', 'column').split(':')[0]), 'mixed sections within a role refused')
  /* 목록 밖 단면 → 막음 */
  db.SECT[999] = { ...structuredClone(db.SECT[old600]), SECT_NAME: 'RH999x999x9x9' }
  for (const id of cols) db.ELEM[id].SECT = 999
  await readGenLoads()
  ok(S.genRead === null && String((S.msgs.at(-1) as any)?.html).includes(t('rb_sect_unknown', '').split(':')[0]), 'unknown section refused')
  /* 정의가 다름(오프셋) → 막음 */
  db.SECT[999] = { ...structuredClone(db.SECT[old600]), SECT_BEFORE: { ...db.SECT[old600].SECT_BEFORE, OFFSET_PT: 'LT' } }
  await readGenLoads()
  ok(S.genRead === null && String((S.msgs.at(-1) as any)?.html).includes(t('rb_sect_definition', '').split(':')[0]), 'different section definition refused')
  /* 해석 옵션(전단변형·뒴)만 다르면 받아들임 — Gen 화면에서 만든 단면 기본값 */
  db.SECT[999] = { ...structuredClone(db.SECT[old600]), SECT_NAME: 'RH500x200x10x16', SECT_BEFORE: { ...db.SECT[old600].SECT_BEFORE, USE_SHEAR_DEFORM: false, SECT_I: { ...db.SECT[old600].SECT_BEFORE.SECT_I, SECT_NAME: 'RH 500x200x10x16' } } }
  await readGenLoads()
  ok(S.genRead?.sections?.changes[0]?.to === 'RH 500x200x10x16' && S.genRead?.sectionOptions.join() === 'RH500x200x10x16', `analysis-option-only difference accepted and reported (${S.genRead?.sections?.changes.map((c) => c.to)} / ${S.genRead?.sectionOptions})`)
  db.ELEM = elemBak; db.SECT = sectBak
  /* 역할 단면은 그대로, 해석 옵션만 Gen 에서 바꿈 → 변경 없음 + 안내, 확정하면 읽은 SECT 가 동일성 기준 (다음 해석 직전 검사가 막지 않음) */
  await readGenLoads(); acceptGenLoads() // 되돌린 Gen 단면(RH 500)을 먼저 받아들여 기준을 맞춤
  const colSid = String(db.ELEM[cols[0]].SECT)
  db.SECT[colSid] = { ...db.SECT[colSid], SECT_BEFORE: { ...db.SECT[colSid].SECT_BEFORE, USE_SHEAR_DEFORM: false } }
  await readGenLoads()
  ok(S.genRead && !S.genRead.sections && S.genRead.sectionOptions.length === 1, `options-only change without section change (${S.genRead?.sectionOptions})`)
  acceptGenLoads()
  let syncErr: unknown
  try { await assertGenSync() } catch (e) { syncErr = e }
  ok(!syncErr && S.genChanged === 0, `accepted Gen SECT/ELEM become the sync baseline (${syncErr})`)
  db.SECT = structuredClone(sectBak)
  await readGenLoads(); acceptGenLoads()
}
/* Gen 에서 형상이 바뀌면 읽기를 막음 */
const node = Object.keys(db.NODE)[0]
db.NODE[node] = { ...db.NODE[node], Z: db.NODE[node].Z + 0.5 }
await readGenLoads()
ok(S.genRead === null && S.genChanged > 0, 'geometry change in Gen blocks reading')
ok(readbackUnavailable({ ...B, spec: { ...B.spec, code: 'CN' } }) === 'rb_code', 'TW only')

console.log(`Gen readback: ${n} checks passed (summary sums, beam load forms, combo issues, notices, info, design, fake-Gen flow, section-only update)`)
