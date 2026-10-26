/* Gen 에서 엔지니어가 바꾼 단면 받아들이기(F2 2단계 C) 라이브 확인 — live-guarded.ts 로 실행 (원본 저장·12 DB 복원).
   ① 기준: 기둥 RH 500x200x10x16 으로 정상 모델링 → 해석 → 설계 검토
   ② 기본 단면(기둥 RH 600)으로 모델 + 자중만 → 엔지니어처럼 하중·조합 전부 PUT + Gen 에서 기둥 단면을 RH 500 으로 바꿈
      (SECT 는 Gen 화면처럼 최소 항목만 — 나머지 기본값은 Gen 이 채움) → 불러오기(단면 변경 감지) → 확정 → 해석 → 설계 검토
   비교: 감지된 변경, 앱 스펙·편집기 단면, 부재 강도비·접합 = 기준.
   실행: node --import tsx scripts/live-guarded.ts -- scripts/live-gensections.ts */
;(globalThis as any).document = { documentElement: { lang: 'ko', dataset: {} } }
const { readMapiKey } = await import('./mapi-key')
const { S } = await import('../src/state/store')
const { setConfirmHandler } = await import('../src/components/ConfirmDialog')
setConfirmHandler(() => true)
const { DEFAULT_SPEC } = await import('../src/domain/types')
const { buildPortal } = await import('../src/domain/portal')
const { buildLoadPayloads } = await import('../src/domain/loads')
const { buildFactory } = await import('../src/actions/build')
const { runAnalysis } = await import('../src/actions/analysis')
const { runDesignCheck } = await import('../src/actions/design')
const { readGenLoads, acceptGenLoads } = await import('../src/actions/readback')
const { mapi } = await import('../src/mapi/client')

S.mapiKey = await readMapiKey(); S.code = 'TW'
const NEW = 'RH 500x200x10x16'
/* --app-options: 전단변형·뒴을 앱 기본(true)으로 — 없으면 Gen 기본값(라이브 2026-10-26: 둘 다 false) */
const appOptions = process.argv.includes('--app-options')
const t0 = Date.now(), sec = () => ((Date.now() - t0) / 1000).toFixed(0)
const errs = () => S.log.filter((x: any) => x.type === 'err').length
const last = () => { const m: any = S.msgs.at(-1); return typeof m?.html === 'string' ? m.html : JSON.stringify(m?.html ?? '') }

/* ① 기준 */
const ref = structuredClone(DEFAULT_SPEC); ref.sections.column = NEW
await buildFactory(ref)
await runAnalysis()
await runDesignCheck()
if (!S.design) throw new Error(`baseline failed: ${last()}`)
const base = new Map(S.design.members.map((m) => [m.id, m.ratio])), baseConn = S.connections!.map((c) => `${c.type}:${c.ratio.toFixed(4)}`).join(' ')
console.log(`[${sec()}s] baseline (column ${NEW}): max ${S.design.maxRatio.toFixed(4)} · ${baseConn}`)

/* ② 엔지니어: 하중·조합 + 기둥 단면 변경 */
const spec = structuredClone(DEFAULT_SPEC)
await buildFactory(spec, { modelOnly: true })
/* 엔지니어 하중은 새 단면(기준) 모델로 계산한 것 — 지진력(자중 기반)까지 기준과 같게 해 결과를 그대로 비교 (요소 번호는 단면과 무관하게 같음) */
const l = buildLoadPayloads(ref, buildPortal(ref))
for (const [db, a] of [['STLD', l.STLD], ['BMLD', l.BMLD], ['CNLD', l.CNLD], ['LCOM-GEN', l['LCOM-GEN']]] as const) await mapi('PUT', db, { Assign: a }, `engineer ${db}`)
const sect = (await mapi<any>('GET', 'SECT')).SECT, sid = Math.max(...Object.keys(sect).map(Number)) + 1
await mapi('PUT', 'SECT', { Assign: { [sid]: { SECTTYPE: 'DBUSER', SECT_NAME: NEW.replace(/ /g, ''), SECT_BEFORE: { SHAPE: 'H', DATATYPE: 1, ...(appOptions ? { USE_SHEAR_DEFORM: true, USE_WARPING_EFFECT: true } : {}), SECT_I: { DB_NAME: 'CNS2020', SECT_NAME: NEW } } } } }, 'engineer section (minimal)')
const got = (await mapi<any>('GET', 'SECT')).SECT[sid]
console.log(`Gen-filled section: ${JSON.stringify(got).slice(0, 400)}`)
const cols = S.built!.model.elements.filter((e) => e.role === 'column').map((e) => e.id)
const elem = (await mapi<any>('GET', 'ELEM')).ELEM
await mapi('PUT', 'ELEM', { Assign: Object.fromEntries(cols.map((id) => [id, { ...elem[id], SECT: sid }])) }, 'engineer column section')
await readGenLoads()
const r = S.genRead
if (!r) throw new Error(`readback failed: ${last()}`)
console.log(`[${sec()}s] read: section changes ${JSON.stringify(r.sections?.changes ?? [])} · option notice [${r.sectionOptions}]`)
acceptGenLoads()
console.log(`accepted: spec column ${S.built!.spec.sections.column} · editor column ${S.activePlan?.spec.sections.column}`)
await runAnalysis()
await runDesignCheck()
if (!S.design) throw new Error(`readback design failed: ${last()}`)
let maxDiff = 0
for (const [id, v] of base) maxDiff = Math.max(maxDiff, Math.abs((S.design.members.find((m) => m.id === id)?.ratio ?? NaN) - v))
const genConn = S.connections!.map((c) => `${c.type}:${c.ratio.toFixed(4)}`).join(' ')
console.log(`[${sec()}s] readback design: max ${S.design.maxRatio.toFixed(4)} · member ratio max |Δ| ${maxDiff.toExponential(2)} · ${genConn} · connections equal ${genConn === baseConn}`)
console.log(`API errors ${errs()}`)
