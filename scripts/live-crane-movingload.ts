/* Gen 이동하중(Moving Load) API 라이브 시험 — 앱 크레인 정적 케이스(CR…)와 Gen 영향선 정밀 해석 비교.
   실행: node --import tsx scripts/live-guarded.ts -- scripts/live-crane-movingload.ts (원본 저장·복원). 왼쪽 레일만 하중(minWheel 0·편심 0·횡력/제동 0) → 두 방식이 같은 하중을 표현 */
;(globalThis as any).document = { documentElement: { lang: 'ko', dataset: {} } }
const { writeFileSync } = await import('node:fs')
const { readMapiKey } = await import('./mapi-key')
const { S } = await import('../src/state/store')
const { setConfirmHandler } = await import('../src/components/ConfirmDialog')
setConfirmHandler(() => true)
const { defaultSpecFor } = await import('../src/domain/types')
const { defaultAdditions } = await import('../src/domain/additions')
const { sendModel } = await import('../src/actions/build')
const { analyzeCore } = await import('../src/actions/analysis')
const { mapi, tableOf } = await import('../src/mapi/client')
const OUT = 'output/live-crane-movingload.json'
const ev: any = { steps: [] }
const save = () => writeFileSync(OUT, JSON.stringify(ev, null, 1))
const step = async (label: string, f: () => Promise<any>) => {
  try { const r = await f(); ev.steps.push({ label, ok: true, r }); console.log(`OK   ${label}`); save(); return r }
  catch (e: any) { ev.steps.push({ label, ok: false, err: e.message }); console.log(`FAIL ${label}: ${e.message}`); save(); return undefined }
}

S.mapiKey = await readMapiKey(); S.code = 'TW'
const spec = structuredClone(defaultSpecFor('TW'))
spec.features = { crane: true, mezzanine: false, multiSpan: false, opening: false }
spec.additions = defaultAdditions(spec)
const P = 45, IMP = 1.1, s = 3
spec.additions.crane = { id: 'CR1', elevation: 5.2, eccentricity: 0, wheelSpacing: s, maxWheel: P, minWheel: 0, impactFactor: IMP, lateral: 0, braking: 0, seismicWeight: 30, driftLimitMm: 10,
  source: 'MVL probe', confirmed: true, runway: { section: spec.sections.rafter, deflectionDivisor: 600, source: 'MVL probe', confirmed: true } } as any
spec.additions.factors = { ...spec.additions.factors, source: 'MVL probe', confirmed: true }
await sendModel(spec)
await analyzeCore()
const b = S.built!
const nodes = new Map(b.model.nodes.map((n: any) => [n.id, n]))
const rail = b.model.elements.filter((e: any) => e.addition === 'runway-beam' && nodes.get(e.n1)!.x === 0)
  .sort((a: any, c: any) => Math.min(nodes.get(a.n1)!.y, nodes.get(a.n2)!.y) - Math.min(nodes.get(c.n1)!.y, nodes.get(c.n2)!.y))
const railIds = rail.map((e: any) => e.id)
const crCases = b.model.additions!.craneCases.filter((c: any) => c.maxRail === 'left').map((c: any) => c.name)
ev.model = { nodes: b.model.nodes.length, elems: b.model.elements.length, cases: b.cases.length, railElems: railIds.length, crLeft: crCases.length, crAll: b.model.additions!.craneCases.length,
  positions: [...new Set(b.model.additions!.craneCases.map((c: any) => c.position))] }
console.log('model', JSON.stringify(ev.model))
ev.frls = await step('GET FRLS (runway ends?)', async () => { const f: any = await mapi('GET', '/db/FRLS'); return railIds.slice(0, 4).map((id: number) => [id, f?.FRLS?.[id] ?? null]) })

/* ── Gen 이동하중 정의 ── */
/* Gen 이 받는 이동하중 기준 찾기 (TAIWAN 은 Gen 에서 'Unavailable moving load code' — 1차 시험) */
const CODES: [string, number][] = [['AASHTO STANDARD', 1], ['KOREA', 6], ['AASHTO LRFD', 2], ['TAIWAN', 9], ['CHINA', 3], ['KSCE-LSD15', 13]]
let mvCode = 9
for (const [c, n] of CODES) {
  const r = await step(`MVCD ${c}`, () => mapi('POST', '/db/MVCD', { Assign: { 1: { CODE: c } } }))
  const g: any = await step(`GET MVCD after ${c}`, () => mapi('GET', '/db/MVCD'))
  if (r !== undefined && g?.MVCD) { ev.mvcd = c; mvCode = n; break }
}
await step('LLAN left rail', () => mapi('POST', '/db/LLAN', { Assign: { 1: { COMMON: { LL_NAME: 'RW_L', LOAD_DIST: 'LANE', MOVING: 'BOTH', WHEEL_SPACE: 0, WIDTH: 0 },
  LANE_ITEMS: railIds.map((id: number, i: number) => ({ ELEM: id, ECC: 0, FACT: 0, SPAN_START: i === 0 })) } } }))
let vehOk = false
for (const code of [mvCode]) {
  const r = await step(`MVHL user vehicle MVLD_CODE ${code}`, () => mapi('POST', '/db/MVHL', { Assign: { 1: { MVLD_CODE: code, VEHICLE_LOAD_NAME: 'CRANE', VEHICLE_LOAD_NUM: 2, USER_LOAD_TYPE: 'Truck/Lane',
    VEH_DEFAULT: { DYN_LOAD_ALLOWANCE: 0, UNIFORM_LOAD: 0 }, LOAD_ITEMS: [{ POINT_LOAD: P * IMP, POINT_DIST: s }, { POINT_LOAD: P * IMP, POINT_DIST: 0 }] } } }))
  const g: any = await mapi('GET', '/db/MVHL').catch(() => null)
  if (r && g?.MVHL) { vehOk = true; ev.vehicleCode = code; break }
}
await step('GET MVHL', () => mapi('GET', '/db/MVHL'))
await step('MVHC class', () => mapi('POST', '/db/MVHC', { Assign: { 1: { VEHICLE_CLS_NAME: 'VC1', VEHICLE_LD_NAMES: ['CRANE'] } } }))
const sub = (type: string, name: string) => ({ LCNAME: 'MV1', DESC: 'crane', TYPE: 0, DEFAULT: { LANE_FACTOR_TYPE: 1, SCALE_FACTORS: [1, 1, 0.9, 0.75, 0.75, 0.75], COMB_OPTION: 'INDEPENDENT',
  SUB_LOAD_DATAS: [{ VEHICLE_TYPE: type, VEHICLE_NAME: name, SCALE_FACTOR: 1, MIN_LOADED_LANE: 0, MAX_LOADED_LANE: 1, LANE_NAMES: ['RW_L'] }] } })
const mv = (await step('MVLD case (VC)', () => mapi('POST', '/db/MVLD', { Assign: { 1: sub('VC', 'VC1') } }))) ?? (await step('MVLD case (VL)', () => mapi('POST', '/db/MVLD', { Assign: { 1: sub('VL', 'CRANE') } })))
await step('GET MVLD', () => mapi('GET', '/db/MVLD'))
await step('MVCT control', () => mapi('POST', '/db/MVCT', { Assign: { 1: { POINT: 'INF', iIGP: 0, iIGPN: 8, PLATE: 'CENTER', FRAME: 'AXIAL', bREAC: true, bDISP: true, bFM: true } } }))
await step('LCOM with MV case', () => mapi('POST', '/db/LCOM-GEN', { Assign: { 9000: { NAME: 'MVTEST', ACTIVE: 'ACTIVE', iTYPE: 0, DESC: '1.6MV', vCOMB: [{ ANAL: 'MV', LCNAME: 'MV1', FACTOR: 1.6 }] } } }))
ev.defined = { vehOk, mv: !!mv }

/* ── 재해석 (자동 저장 → doc/anal) ── */
const anal = await step('analysis with moving load', async () => { const t = performance.now(); await analyzeCore(); return { s: ((performance.now() - t) / 1000).toFixed(1) } })

/* ── 결과 비교 ── */
const bf = async (loads: string[]) => {
  const j = await mapi<any>('POST', '/post/TABLE', { Argument: { TABLE_NAME: 'BF', TABLE_TYPE: 'BEAMFORCE', UNIT: { FORCE: 'KN', DIST: 'M' }, STYLES: { FORMAT: 'Fixed', PLACE: 4 },
    COMPONENTS: ['Elem', 'Load', 'Part', 'Shear-z', 'Moment-y'], NODE_ELEMS: { KEYS: railIds }, LOAD_CASE_NAMES: loads, PARTS: ['PartI', 'Part1/4', 'Part2/4', 'Part3/4', 'PartJ'] } })
  return (tableOf(j).DATA ?? []) as string[][]
}
const env = (rows: string[][]) => {
  const m = new Map<number, { Mpos: number; Mneg: number; V: number }>()
  for (const r of rows) { const e = +r[1], V = +r[4], M = +r[5]; const o = m.get(e) ?? { Mpos: -Infinity, Mneg: Infinity, V: 0 }; o.Mpos = Math.max(o.Mpos, M); o.Mneg = Math.min(o.Mneg, M); o.V = Math.max(o.V, Math.abs(V)); m.set(e, o) }
  return m
}
const app = await step('BEAMFORCE app CR (left rail) cases', async () => { const rows: string[][] = []; for (let i = 0; i < crCases.length; i += 40) for (const r of await bf(crCases.slice(i, i + 40).map((c: string) => `${c}(ST)`))) rows.push(r); return rows.length ? rows : null })
const gen = await step('BEAMFORCE Gen MV1 max/min', async () => { const rows = await bf(['MV1(MV:max)', 'MV1(MV:min)']); return rows.length ? rows : null })
if (app && gen) {
  const A = env(app), G = env(gen)
  ev.compare = railIds.map((id: number) => { const a = A.get(id)!, g = G.get(id)!; return { id, y: [nodes.get(rail.find((e: any) => e.id === id)!.n1)!.y, nodes.get(rail.find((e: any) => e.id === id)!.n2)!.y], appM: [a?.Mpos, a?.Mneg], genM: [g?.Mpos, g?.Mneg], appV: a?.V, genV: g?.V } })
  const max = (m: Map<number, any>, k: string) => Math.max(...[...m.values()].map((o) => Math.abs(o[k])))
  ev.summary = { appMpos: max(A, 'Mpos'), genMpos: max(G, 'Mpos'), appMneg: max(A, 'Mneg'), genMneg: max(G, 'Mneg'), appV: max(A, 'V'), genV: max(G, 'V') }
  console.log('summary', JSON.stringify(ev.summary))
}
/* 반력 — 왼쪽 기둥 기초 FZ: 앱 CR 포락 vs Gen MV */
const bases = b.model.nodes.filter((n: any) => n.z === 0 && n.x === 0).map((n: any) => n.id)
const reac = async (loads: string[]) => { const j = await mapi<any>('POST', '/post/TABLE', { Argument: { TABLE_NAME: 'R', TABLE_TYPE: 'REACTIONG', UNIT: { FORCE: 'kN', DIST: 'm' }, STYLES: { FORMAT: 'Fixed', PLACE: 3 },
  COMPONENTS: ['Node', 'Load', 'FZ'], NODE_ELEMS: { KEYS: bases }, LOAD_CASE_NAMES: loads } }); return (tableOf(j).DATA ?? []) as string[][] }
const ra = await step('REACTIONG app CR', async () => { const rows: string[][] = []; for (let i = 0; i < crCases.length; i += 40) for (const r of await reac(crCases.slice(i, i + 40).map((c: string) => `${c}(ST)`))) rows.push(r); return rows })
const rg = await step('REACTIONG Gen MV1', () => reac(['MV1(MV:max)', 'MV1(MV:min)']))
if (ra && rg) {
  const mx = (rows: string[][]) => { const m = new Map<number, number>(); for (const r of rows) m.set(+r[1], Math.max(m.get(+r[1]) ?? 0, Math.abs(+r[3]))); return m }
  const A = mx(ra), G = mx(rg)
  ev.reactions = bases.map((n: number) => ({ node: n, y: nodes.get(n)!.y, app: A.get(n), gen: G.get(n) }))
}
ev.genCols = gen?.[0]; ev.appCols = app?.[0]
ev.analysis = anal
save()
console.log('API errors', S.log.filter((x: any) => x.type === 'err').length)
