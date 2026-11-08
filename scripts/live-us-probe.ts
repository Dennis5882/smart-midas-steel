/* US 기준 준비 — Gen NX 가 받아들이는 미국 재료·단면 DB·설계코드 이름 확인 (live-guarded.ts 로 실행: 원본 저장·12 DB 복원).
   후보 이름은 설치 폴더 Dbase/*.sdb·DgnBase_MBCS.dll·wg_acs.dll 문자열에서 (2026-10-28).
   실행: node --import tsx scripts/live-guarded.ts -- scripts/live-us-probe.ts */
;(globalThis as any).document = { documentElement: { lang: 'ko', dataset: {} } }
const { readMapiKey } = await import('./mapi-key')
const { S } = await import('../src/state/store')
const { mapi } = await import('../src/mapi/client')
const { autoSave } = await import('../src/actions/save')
const { tableOf } = await import('../src/mapi/client')

S.mapiKey = await readMapiKey()
const msg = (e: unknown) => String((e as Error)?.message ?? e).replace(/\s+/g, ' ').slice(0, 160)
const tryPut = async (db: string, assign: Record<string, unknown>) => { try { await mapi('PUT', db, { Assign: assign }); return 'ok' } catch (e) { return msg(e) } }
const get = async (db: string) => { try { return ((await mapi('GET', db)) as any)?.[db] ?? {} } catch { return {} } }

await autoSave('backup')
await mapi('POST', '/doc/new', {})
await mapi('PUT', 'UNIT', { Assign: { 1: { FORCE: 'KN', DIST: 'M', HEAT: 'KJ', TEMPER: 'C' } } })

/* 1. 재료 — 표준별 강종 (A36·A53 는 목록에서 못 찾아 시험용) */
const grades: [string, string][] = [
  ...['A36', 'A992', 'A572-50', 'A572-42', 'A529-50', 'A588-50', 'A500-46', 'A500-50', 'A500-B', 'A500-C', 'A53', 'A913-50', 'A1011-50', 'A1011-55'].map((g) => ['ASTM(S)', g] as [string, string]),
  ...['A36', 'A992', 'A572-50', 'A500-46', 'A500-50', 'A913-50', 'A1011-33', 'A1011-50', 'A1011-55', 'A847'].map((g) => ['ASTM09(S)', g] as [string, string]),
]
let id = 0
const matRows: string[] = []
for (const [std, g] of grades) {
  id++
  const r = await tryPut('MATL', { [id]: { TYPE: 'STEEL', NAME: `${std === 'ASTM09(S)' ? '09' : 'S'} ${g}` /* 이름 ≤ 16자 */, DAMP_RAT: 0.02, PARAM: [{ P_TYPE: 1, STANDARD: std, CODE: '', DB: g, bELAST: false }] } })
  matRows.push(`${id}\t${std}\t${g}\t${r}`)
}
const matl = await get('MATL')
console.log('== MATL (id, standard, grade, PUT result, Gen values)')
for (const row of matRows) {
  const mid = row.split('\t')[0], p = matl[mid]?.PARAM?.[0]
  console.log(row, p ? JSON.stringify({ DB: p.DB, ELAST: p.ELAST, POISN: p.POISN, DEN: p.DEN, FY: p.FY ?? p.STR_Y, keys: Object.keys(p).join(',') }) : '')
}

/* 2. 단면 — DB 이름·SHAPE 코드 */
const sects: [string, string, string[]][] = [
  ['AISC16(SI)', 'W310X38.7', ['H']], ['AISC16(SI)', 'W610X101', ['H']], ['AISC16(SI)', 'HSS203.2X203.2X9.5', ['B']],
  ['AISC16(SI)', 'HSS168.3X7.1', ['P']], ['AISC16(SI)', 'Pipe150STD', ['P']], ['AISC16(SI)', 'C250X22.8', ['C']], ['AISC16(SI)', 'L102X102X9.5', ['L']],
  ['AISC16(US)', 'W12X26', ['H']], ['AISC16', 'W310X38.7', ['H']], ['AISC2016(SI)', 'W310X38.7', ['H']],
  ['AISC10(SI)', 'W310X38.7', ['H']], ['AISC10(SI)', 'HSS203.2X203.2X9.5', ['B', 'SR', 'P']], ['AISC10(SI)', 'HSS168.3X7.1', ['P', 'B']],
  ['AISC10(SI)', 'Pipe150STD', ['P']], ['AISC10(SI)', 'C250X22.8', ['C']], ['AISC10(SI)', 'L102X102X9.5', ['L']], ['AISC10(US)', 'W12X26', ['H']],
  ['AISI08(US)', '8ZS2.75x070', ['Z', 'CZ', 'LZ']], ['AISI08(US)', '8ZU1.25x105', ['Z', 'CZ', 'LZ']], ['AISI08(US)', '12Z3.25x105', ['Z', 'CZ', 'LZ']],
]
let sid = 0
const sectRows: string[] = []
for (const [db, name, shapes] of sects) {
  sid++
  let r = ''
  for (const shape of shapes) {
    r = await tryPut('SECT', { [sid]: { SECTTYPE: 'DBUSER', SECT_NAME: name, SECT_BEFORE: { OFFSET_PT: 'CC', OFFSET_CENTER: 0, USER_OFFSET_REF: 0, HORZ_OFFSET_OPT: 0, USERDEF_OFFSET_YI: 0, VERT_OFFSET_OPT: 0, USERDEF_OFFSET_ZI: 0, USE_SHEAR_DEFORM: true, USE_WARPING_EFFECT: false, SHAPE: shape, DATATYPE: 1, SECT_I: { DB_NAME: db, SECT_NAME: name } } } })
    if (r === 'ok') { r = `ok (SHAPE ${shape})`; break }
  }
  sectRows.push(`${sid}\t${db}\t${name}\t${r}`)
}
let props: any[] = []
try {
  props = tableOf(await mapi('POST', '/post/TABLE', { Argument: { TABLE_NAME: 'S', TABLE_TYPE: 'SECTIONALL', UNIT: { FORCE: 'KN', DIST: 'MM', HEAT: 'KJ', TEMP: 'C' } } })) as any
} catch (e) { console.log('SECTIONALL failed', msg(e)) }
const head = (props as any)?.HEAD as string[] | undefined, data = (props as any)?.DATA as any[][] | undefined
console.log('== SECT (id, DB, name, PUT result) + SECTIONALL row')
for (const row of sectRows) {
  const sidS = row.split('\t')[0], d = row.includes('\tok') ? data?.find((x) => String(x[1]) === sidS) : undefined
  console.log(row, d && head ? JSON.stringify(Object.fromEntries(head.map((h, i) => [h, d[i]]).filter(([h]) => /^(ID|Name|Area|Iyy|Izz|Ixx|Shape)/i.test(String(h))))) : '')
}
if (head) console.log('SECTIONALL head:', head.join(' | '))

/* 3. 설계코드 — DSTL DGNCODE */
console.log('== DSTL DGNCODE')
for (const code of ['AISC(16th)-LRFD22', 'AISC(16th)-ASD22', 'AISC(15th)-LRFD16', 'AISC(15th)-ASD16', 'AISC(14th)-LRFD10', 'AISI-CFSD08']) {
  const r = await tryPut('DSTL', { 1: { DGNCODE: code } })
  const back = (await get('DSTL'))?.['1']?.DGNCODE
  console.log(code, '→', r, '| read back:', back)
}
console.log('api errors (expected for rejected names):', S.log.filter((x: any) => x.type === 'err').length)
