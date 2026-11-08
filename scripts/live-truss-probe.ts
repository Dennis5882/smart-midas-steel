/* Gen NX 2026 v2.2 (빌드 2026-10-30) — 해석 후 TRUSSFORCE 결과 표 요청 때 Gen 이 죽는 현상 재현 (2026-11-03).
   TW 기본 모델 생성·해석 뒤, 가장 단순한 요청부터 하나씩 보내 Gen 을 처음 죽게 만든 단계를 찾는다(단계 이름을 먼저 출력).
   실행: node --import tsx scripts/live-guarded.ts -- scripts/live-truss-probe.ts [--from N] */
import { readMapiKey } from './mapi-key'

let key = await readMapiKey()
;(globalThis as any).document = { documentElement: { lang: 'ko', dataset: {} } }
const { S } = await import('../src/state/store')
const { DEFAULT_SPEC, normalizeSpans, withTrussDefaults } = await import('../src/domain/types')
const { sendModel } = await import('../src/actions/build')
const { analyzeCore } = await import('../src/actions/analysis')
const { mapi, tableOf } = await import('../src/mapi/client')
const { isAxialRole } = await import('../src/domain/types')

S.mapiKey = key; key = ''; S.code = 'TW'
const from = process.argv.includes('--from') ? +process.argv[process.argv.indexOf('--from') + 1] : 1
await sendModel(withTrussDefaults(normalizeSpans(structuredClone(DEFAULT_SPEC))))
await analyzeCore()
const m = S.built!.model
const truss = m.elements.filter((e) => isAxialRole(e.role)).map((e) => e.id)
const beams = m.elements.filter((e) => !isAxialRole(e.role)).map((e) => e.id)
const cases = S.built!.cases.map((c) => `${c}(ST)`)
console.log(`model: truss ${truss.length}, beams ${beams.length}, cases ${cases.length}; first truss ${truss[0]}`)

const style = { UNIT: { FORCE: 'KN', DIST: 'M' }, STYLES: { FORMAT: 'Fixed', PLACE: 5 } }
const steps: [string, Record<string, unknown>][] = [
  ['1 BEAMFORCE 1 beam, 1 case (control)', { TABLE_NAME: 'B', TABLE_TYPE: 'BEAMFORCE', ...style, NODE_ELEMS: { KEYS: [beams[0]] }, LOAD_CASE_NAMES: [cases[0]] }],
  ['2 TRUSSFORCE 1 truss, 1 case, minimal argument', { TABLE_NAME: 'T', TABLE_TYPE: 'TRUSSFORCE', NODE_ELEMS: { KEYS: [truss[0]] }, LOAD_CASE_NAMES: [cases[0]] }],
  ['3 TRUSSFORCE 1 truss, 1 case, app argument (UNIT+STYLES)', { TABLE_NAME: 'T', TABLE_TYPE: 'TRUSSFORCE', ...style, NODE_ELEMS: { KEYS: [truss[0]] }, LOAD_CASE_NAMES: [cases[0]] }],
  ['4 TRUSSFORCE all truss, 1 case', { TABLE_NAME: 'T', TABLE_TYPE: 'TRUSSFORCE', ...style, NODE_ELEMS: { KEYS: truss }, LOAD_CASE_NAMES: [cases[0]] }],
  ['5 TRUSSFORCE all truss, all cases (what the app sends)', { TABLE_NAME: 'T', TABLE_TYPE: 'TRUSSFORCE', ...style, NODE_ELEMS: { KEYS: truss }, LOAD_CASE_NAMES: cases }],
]
/* --app: 앱 fetchResults 와 같은 순서 — 보 전체 BEAMFORCE(5위치) 큰 표 다음에 TRUSSFORCE. 단계마다 Gen 메모리(MB) */
if (process.argv.includes('--app')) {
  steps.length = 0
  steps.push(
    ['A1 BEAMFORCE all beams × all cases × 5 stations', { TABLE_NAME: 'B', TABLE_TYPE: 'BEAMFORCE', ...style, NODE_ELEMS: { KEYS: beams }, LOAD_CASE_NAMES: cases, PARTS: ['PartI', 'Part1/4', 'Part2/4', 'Part3/4', 'PartJ'], COMPONENTS: ['Elem', 'Load', 'Part', 'Axial', 'Shear-y', 'Shear-z', 'Moment-y', 'Moment-z'] }],
    ['A2 TRUSSFORCE all truss × all cases', { TABLE_NAME: 'T', TABLE_TYPE: 'TRUSSFORCE', ...style, NODE_ELEMS: { KEYS: truss }, LOAD_CASE_NAMES: cases }],
  )
}
const { execSync } = await import('node:child_process')
const genMB = () => { try { return Math.round(+execSync('powershell -NoProfile -Command "(Get-Process GenNX).WorkingSet64"').toString().trim() / 1048576) } catch { return -1 } }
for (const [name, arg] of steps.filter((_, i) => i + 1 >= from)) {
  console.log(`>> ${name} (Gen ${genMB()} MB)`)
  const t = Date.now()
  const out: any = tableOf(await mapi('POST', '/post/TABLE', { Argument: arg }, name))
  console.log(`   ok ${Date.now() - t} ms, rows ${out?.DATA?.length ?? '?'}, Gen ${genMB()} MB, head ${JSON.stringify(out?.HEAD ?? null).slice(0, 120)}`)
}
console.log('all steps passed')
