/* Gen 바닥 하중(FBLD/FBLA)으로 풍압을 면에 넣는 방식 라이브 시험 — 앱의 부재 선하중(BMLD)과 비교.
   범위: WX1 의 풍상벽(x0)·풍하벽(xL)·지붕 두 면 (박공벽 y0·yL 과 박공 삼각부는 양쪽 모두 제외)
   WA = 앱 BMLD 를 그대로 복사, WF = Gen 바닥 하중(풍상벽 높이 구간별 q(z), 나머지 균일) — 같은 범위·같은 합력이 되게
   실행: node --import tsx scripts/live-guarded.ts -- scripts/live-wind-floorload.ts (원본 저장·복원) */
;(globalThis as any).document = { documentElement: { lang: 'ko', dataset: {} } }
const { writeFileSync, mkdirSync } = await import('node:fs')
const { readMapiKey } = await import('./mapi-key')
const { S } = await import('../src/state/store')
const { setConfirmHandler } = await import('../src/components/ConfirmDialog')
setConfirmHandler(() => true)
const { DEFAULT_SPEC } = await import('../src/domain/types')
const { portalGeometry } = await import('../src/domain/portal')
const { sendModel } = await import('../src/actions/build')
const { analyzeCore } = await import('../src/actions/analysis')
const { mapi, tableOf } = await import('../src/mapi/client')
mkdirSync('output', { recursive: true })
const OUT = 'output/live-wind-floorload.json'
const ev: any = { steps: [] }
const save = () => writeFileSync(OUT, JSON.stringify(ev, null, 1))
const step = async (label: string, f: () => Promise<any>) => {
  try { const r = await f(); ev.steps.push({ label, ok: true }); console.log(`OK   ${label}`); save(); return r }
  catch (e: any) { ev.steps.push({ label, ok: false, err: e.message }); console.log(`FAIL ${label}: ${e.message}`); save(); return undefined }
}

S.mapiKey = await readMapiKey(); S.code = 'TW'
const spec = structuredClone(DEFAULT_SPEC)
await sendModel(spec)
const b = S.built!
const G = portalGeometry(spec)
const nodes = new Map(b.model.nodes.map((n) => [n.id, n]))
const key = (x: number, y: number, z: number) => `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`
const at = new Map(b.model.nodes.map((n) => [key(n.x, n.y, n.z), n.id]))
const len = (e: any) => { const a = nodes.get(e.n1)!, c = nodes.get(e.n2)!; return Math.hypot(c.x - a.x, c.y - a.y, c.z - a.z) }
const mid = (e: any) => { const a = nodes.get(e.n1)!, c = nodes.get(e.n2)!; return { x: (a.x + c.x) / 2, y: (a.y + c.y) / 2, z: (a.z + c.z) / 2 } }
const span = spec.span, H = spec.eaveHeight, ridge = G.ridgeZ, L = spec.bays * spec.baySpacing
const ys = Array.from({ length: spec.bays + 1 }, (_, i) => i * spec.baySpacing)
const roofLevel = (e: any) => Math.min(nodes.get(e.n1)!.z, nodes.get(e.n2)!.z) >= H - 1e-6
const scope = (e: any) => (e.role === 'girt' && (e.face === 'x0' || e.face === 'xL')) || ((e.role === 'purlin' || e.role === 'strut') && roofLevel(e))

/* ── WA: 앱 BMLD 의 WX1 항목을 범위 안 요소만 복사 ── */
const sent: any = b.sent!.BMLD
const tot = { wwX: 0, lwX: 0, roof0: [0, 0, 0], roofL: [0, 0, 0] } // 면별 앱 합력 (kN)
const waItems: Record<string, any> = {}
for (const e of b.model.elements.filter(scope)) {
  const rec = sent[e.id]; if (!rec) continue
  const items = rec.ITEMS.filter((it: any) => it.LCNAME === 'WX1')
  if (!items.length) continue
  let nextId = Math.max(...rec.ITEMS.map((it: any) => it.ID)) + 1
  waItems[e.id] = { ITEMS: [...rec.ITEMS, ...items.map((it: any) => ({ ...it, ID: nextId++, LCNAME: 'WA' }))] }
  for (const it of items) {
    const f = it.P[0] * len(e), c = mid(e), comp = 'XYZ'.indexOf(it.DIRECTION[1])
    if (e.role === 'girt') { if (e.face === 'x0') tot.wwX += comp === 0 ? f : 0; else tot.lwX += comp === 0 ? f : 0 }
    else {
      /* 처마 스트럿의 측벽 반 칸(GX)은 벽으로, 마루 스트럿은 두 면에 반씩 */
      const isEave = Math.abs(c.z - H) < 1e-6
      if (isEave && comp === 0) { if (c.x < span / 2) tot.wwX += f; else tot.lwX += f; continue }
      const isRidge = Math.abs(c.x - span / 2) < 1e-6
      if (isRidge) { tot.roof0[comp] += f / 2; tot.roofL[comp] += f / 2 } else (c.x < span / 2 ? tot.roof0 : tot.roofL)[comp] += f
    }
  }
}
ev.appTotals = tot
console.log('app totals', JSON.stringify(tot))

/* ── WF: 바닥 하중 — 풍압 (kN/m², + = 면을 누름) ── */
const pf = b.info.wind.profile!, pi = b.info.wind.cases.find((c) => c.name === 'WX1')!.gcpi * b.info.wind.qh
const qzAt = (z: number) => { const r = pf.rows; if (z <= r[0].z) return r[0].windward; for (let i = 1; i < r.length; i++) if (z <= r[i].z) return r[i - 1].windward + (r[i].windward - r[i - 1].windward) * (z - r[i - 1].z) / (r[i].z - r[i - 1].z); return r[r.length - 1].windward }
const levels = [0, ...G.girtZsAt(0), H].filter((v, i, a) => a.indexOf(v) === i).sort((a, c) => a - c)
const slopeLen = Math.hypot(span / 2, ridge - H), nIn = [[ (ridge - H) / slopeLen, 0, -(span / 2) / slopeLen ], [ -(ridge - H) / slopeLen, 0, -(span / 2) / slopeLen ]] // 지붕 안쪽 법선 (x0 면·xL 면)
const roofP = (v: number[], k: 0 | 1) => (v[0] * nIn[k][0] + v[2] * nIn[k][2]) / (slopeLen * L) // 면에 수직인 성분 / 면적
const leeP = -tot.lwX / (H * L) // xL 벽: +X 합력 = 바깥으로 빨림 → 누르는 압력은 음수
ev.pressures = { windwardNetAt: levels.map((z) => [z, qzAt(z) - pi]), leeward: leeP, roof0: roofP(tot.roof0, 0), roofL: roofP(tot.roofL, 1), leewardFromProfile: pf.leewardX - pi }
/* 패널 목록: [이름, 절점 4개, 압력, 방향] — 절점 순서: 첫 변 = +Y (국부 x), 하중 각 90° = 국부 y 방향으로 1방향 분배 */
const panels: { nodes: number[]; p: number; dir: string }[] = []
const miss: string[] = []
const need = (x: number, y: number, z: number) => { const id = at.get(key(x, y, z)); if (!id) miss.push(key(x, y, z)); return id ?? 0 }
for (let j = 0; j < spec.bays; j++) {
  /* 맨 아래 구간(기초~첫 거트)은 바닥선에 보가 없어 Gen 바닥 하중이 거부함(라이브 2026-10-21 'Unknown Error', 한 패널 때문에 일괄 등록 전체 실패) → 제외.
     앱 선하중은 그 구간 위 절반을 첫 거트에 싣는다 — 차이 예상값 baseHalf 로 따로 기록 */
  for (let i = levels[0] === 0 ? 1 : 0; i < levels.length - 1; i++) {
    const z0 = levels[i], z1 = levels[i + 1], p = qzAt((z0 + z1) / 2) - pi
    panels.push({ nodes: [need(0, ys[j], z0), need(0, ys[j + 1], z0), need(0, ys[j + 1], z1), need(0, ys[j], z1)], p, dir: 'GX' })
    panels.push({ nodes: [need(span, ys[j], z0), need(span, ys[j + 1], z0), need(span, ys[j + 1], z1), need(span, ys[j], z1)], p: leeP, dir: 'GXneg' })
  }
  panels.push({ nodes: [need(0, ys[j], H), need(0, ys[j + 1], H), need(span / 2, ys[j + 1], ridge), need(span / 2, ys[j], ridge)], p: ev.pressures.roof0, dir: 'LZ' })
  panels.push({ nodes: [need(span / 2, ys[j], ridge), need(span / 2, ys[j + 1], ridge), need(span, ys[j + 1], H), need(span, ys[j], H)], p: ev.pressures.roofL, dir: 'LZ' })
}
ev.panels = panels.length; ev.missingNodes = miss
const z1 = levels[1]
ev.baseHalf = { windwardX: (qzAt(z1 * 0.75) - pi) * (z1 / 2) * L, leewardX: -leeP * (z1 / 2) * L } // 앱이 첫 거트에 싣는 아래 구간 위 절반 (kN, +X)
/* 압력값마다 바닥 하중 종류 하나 (벽: 전역 GX 값 = 누르는 방향 부호, 지붕: 국부 z = 안쪽 법선) */
const types = new Map<string, number>()
const fbld: Record<string, any> = {}, fbla: Record<string, any> = {}
let k = 0
for (const pn of panels) {
  const val = pn.dir === 'GX' ? pn.p : pn.dir === 'GXneg' ? -pn.p : pn.p
  const name = `WF_${val.toFixed(4)}`
  if (!types.has(name)) { types.set(name, types.size + 1); fbld[types.size] = { NAME: name, DESC: 'wind floor-load probe', ITEM: [{ LCNAME: 'WF', FLOOR_LOAD: val, OPT_SUB_BEAM_WEIGHT: false }] } }
  fbla[++k] = { FLOOR_LOAD_TYPE_NAME: name, FLOOR_DIST_TYPE: 1, LOAD_ANGLE: 90, SUB_BEAM_NUM: 0, SUB_BEAM_ANGLE: 0, UNIT_SELF_WEIGHT: 0, DIR: pn.dir === 'LZ' ? 'LZ' : 'GX', OPT_PROJECTION: false, DESC: '', OPT_EXCLUDE_INNER_ELEM_AREA: false, GROUP_NAME: '', NODES: pn.nodes }
}
const stld: any = await mapi('GET', '/db/STLD')
const nId = Math.max(...Object.keys(stld.STLD).map(Number)) + 1
await step('STLD WA·WF', () => mapi('POST', '/db/STLD', { Assign: { [nId]: { NAME: 'WA', TYPE: 'W', DESC: 'app line loads (subset)' }, [nId + 1]: { NAME: 'WF', TYPE: 'W', DESC: 'floor-load wind (subset)' } } }))
await step('BMLD WA (app copy)', () => mapi('PUT', '/db/BMLD', { Assign: waItems }))
await step(`FBLD ${types.size} types`, () => mapi('POST', '/db/FBLD', { Assign: fbld }))
await step(`FBLA ${k} panels`, () => mapi('POST', '/db/FBLA', { Assign: fbla }))
ev.fblaBack = await step('GET FBLA count', async () => { const g: any = await mapi('GET', '/db/FBLA'); return Object.keys(g?.FBLA ?? {}).length })
await step('analysis', () => analyzeCore())

/* ── 비교 ── */
const sumOf = async (lc: string) => {
  const j = await mapi<any>('POST', '/post/TABLE', { Argument: { TABLE_NAME: 'R', TABLE_TYPE: 'REACTIONG', UNIT: { FORCE: 'kN', DIST: 'm' }, STYLES: { FORMAT: 'Fixed', PLACE: 3 },
    COMPONENTS: ['Node', 'Load', 'FX', 'FY', 'FZ'], NODE_ELEMS: { KEYS: b.model.nodes.filter((n) => n.z === 0).map((n) => n.id) }, LOAD_CASE_NAMES: [`${lc}(ST)`] } })
  const s = tableOf(j).SUB_TABLES?.[0]?.['SUMMATION OF REACTION FORCES PRINTOUT']?.DATA?.[0]
  return s ? { fx: +s[1], fy: +s[2], fz: +s[3] } : null
}
ev.reactions = { WA: await step('reactions WA', () => sumOf('WA')), WF: await step('reactions WF', () => sumOf('WF')) }
const f3 = 3 // 가운데 골조
const yMid = ys[f3]
const pick = (role: string, pred: (e: any, c: any) => boolean) => b.model.elements.filter((e) => e.role === role && pred(e, mid(e))).map((e) => e.id)
const groups: Record<string, number[]> = {
  'column x0 (frame 4)': pick('column', (_, c) => Math.abs(c.y - yMid) < 1e-6 && c.x < span / 2),
  'column xL (frame 4)': pick('column', (_, c) => Math.abs(c.y - yMid) < 1e-6 && c.x > span / 2),
  'rafter (frame 4)': pick('rafter', (_, c) => Math.abs(c.y - yMid) < 1e-6),
  'girt x0 (bay 3)': pick('girt', (e, c) => e.face === 'x0' && c.y > ys[2] && c.y < ys[3]),
  'purlin x0 slope (bay 3)': pick('purlin', (_, c) => c.y > ys[2] && c.y < ys[3] && c.x < span / 2),
}
const bf = async (ids: number[], lcs: string[]) => {
  const j = await mapi<any>('POST', '/post/TABLE', { Argument: { TABLE_NAME: 'BF', TABLE_TYPE: 'BEAMFORCE', UNIT: { FORCE: 'KN', DIST: 'M' }, STYLES: { FORMAT: 'Fixed', PLACE: 4 },
    COMPONENTS: ['Elem', 'Load', 'Part', 'Moment-y', 'Moment-z'], NODE_ELEMS: { KEYS: ids }, LOAD_CASE_NAMES: lcs, PARTS: ['PartI', 'Part1/4', 'Part2/4', 'Part3/4', 'PartJ'] } })
  return (tableOf(j).DATA ?? []) as string[][]
}
ev.members = {}
for (const [g, ids] of Object.entries(groups)) {
  const rows = await step(`BEAMFORCE ${g}`, () => bf(ids, ['WA(ST)', 'WF(ST)']))
  if (!rows) continue
  const max = (lc: string, col: number) => Math.max(...rows.filter((r) => r[2] === `${lc}(ST)` || r[2] === lc).map((r) => Math.abs(+r[col])))
  ev.members[g] = { WA: { My: max('WA', 4), Mz: max('WA', 5) }, WF: { My: max('WF', 4), Mz: max('WF', 5) }, rows: rows.length }
}
const eave = at.get(key(0, yMid, H))!, eaveL = at.get(key(span, yMid, H))!
const disp = await step('DISPLACEMENTG eave', async () => {
  const j = await mapi<any>('POST', '/post/TABLE', { Argument: { TABLE_NAME: 'D', TABLE_TYPE: 'DISPLACEMENTG', UNIT: { FORCE: 'KN', DIST: 'M' }, STYLES: { FORMAT: 'Fixed', PLACE: 6 },
    COMPONENTS: ['Node', 'Load', 'DX', 'DY', 'DZ'], NODE_ELEMS: { KEYS: [eave, eaveL] }, LOAD_CASE_NAMES: ['WA(ST)', 'WF(ST)'] } })
  return tableOf(j).DATA
})
ev.eaveDisp = disp
save()
console.log('reactions', JSON.stringify(ev.reactions), 'expected FX gap (base half bands)', (ev.baseHalf.windwardX + ev.baseHalf.leewardX).toFixed(2))
for (const [g, v] of Object.entries<any>(ev.members)) console.log(g.padEnd(26), `My WA ${v.WA.My.toFixed(3)} WF ${v.WF.My.toFixed(3)} | Mz WA ${v.WA.Mz.toFixed(3)} WF ${v.WF.Mz.toFixed(3)}`)
console.log('eave', JSON.stringify(disp))
console.log('missing nodes', miss.length, 'API errors', S.log.filter((x: any) => x.type === 'err').length)
