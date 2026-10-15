/* 작업 진행·취소·중복 실행·전송 개수 확인 오프라인 회귀 — 가짜 Gen(fetch 대체), 키·네트워크 불필요.
   실행: node --import tsx scripts/verify-job.ts */
;(globalThis as any).document = { documentElement: { lang: 'ko', dataset: {} } }

type Db = Record<string, Record<string, unknown>>
let db: Db = {}
let calls: string[] = []
let dropNode = false
let onCall: ((n: number, path: string) => void) | null = null
let analDelay = 0

const json = (o: unknown) => new Response(JSON.stringify(o), { status: 200, headers: { 'content-type': 'application/json' } })
;(globalThis as any).fetch = async (url: string, init?: RequestInit) => {
  const path = new URL(url).pathname.replace(/^\/gen/, '')
  const method = init?.method ?? 'GET'
  calls.push(`${method} ${path}`)
  onCall?.(calls.length, path)
  const body = init?.body ? JSON.parse(String(init.body)) : {}
  if (path === '/doc/new') { db = {}; return json({}) }
  if (path === '/doc/anal') { if (analDelay) await new Promise((r) => setTimeout(r, analDelay)); return json({ message: 'ok' }) }
  if (path.startsWith('/doc/') || path.startsWith('/post/')) return json({})
  const name = path.replace('/db/', '')
  if (method === 'PUT') {
    const a = { ...body.Assign }
    if (dropNode && name === 'NODE') delete a[Object.keys(a)[0]]
    db[name] = { ...db[name], ...a }
    return json({ [name]: a })
  }
  if (method === 'GET') return json({ [name]: db[name] ?? {} })
  return json({})
}

const { S } = await import('../src/state/store')
const { DEFAULT_SPEC } = await import('../src/domain/types')
const { buildFactory } = await import('../src/actions/build')
const { runAnalysis } = await import('../src/actions/analysis')
const { cancelJob } = await import('../src/actions/job')
const { t } = await import('../src/i18n')

S.mapiKey = 'offline-test'
S.code = 'TW'
let fails = 0
const ok = (cond: boolean, msg: string) => { console.log(`${cond ? 'OK ' : 'NG '} ${msg}`); if (!cond) fails++ }
const lastBot = () => { const m = [...S.msgs].reverse().find((x) => x.role === 'bot' && x.kind === 'html'); return m && 'html' in m ? m.html : '' }
const reset = () => { calls = []; dropNode = false; onCall = null; analDelay = 0 }
const spec = () => structuredClone(DEFAULT_SPEC)

/* 1. 정상 전송 — 개수 확인 통과, 작업 정리 */
reset()
await buildFactory(spec())
ok(!!S.built && S.job === null && !S.busy, `build ok (${calls.length} calls, built ${!!S.built}, job ${S.job})`)
ok(calls.filter((c) => c.startsWith('GET')).length === 8, 'count check: 8 GETs after PUTs')
ok(S.log.some((l) => l.html === t('log_verify_ok', 8)), 'log: counts verified')

/* 2. Gen 이 절점 하나를 버림 → 실패, 이전 모델 정보 비움 */
reset(); dropNode = true
await buildFactory(spec())
ok(S.built === null && lastBot().includes('NODE') && lastBot().includes('/'), `count mismatch fails: ${lastBot().replace(/<[^>]+>/g, '')}`)

/* 3. 전송 도중 취소 → 다음 호출 전에 멈춤, 모델 중간 상태 안내 */
reset()
onCall = (n) => { if (n === 5) cancelJob() }
await buildFactory(spec())
ok(calls.length === 5, `cancel stops before next call (calls ${calls.length})`)
ok(S.built === null && lastBot() === t('job_cancelled_model'), 'cancel mid-send → rebuild message')
ok(S.job === null && !S.busy, 'job cleared after cancel')

/* 4. 해석 중 취소 → 해석 호출은 끝까지, 이후 호출 없음, 모델 유지 */
reset()
await buildFactory(spec())
reset(); analDelay = 200
const p = runAnalysis()
await new Promise((r) => setTimeout(r, 50))
ok(S.job?.stage === 'st_anal' && calls.at(-1) === 'POST /doc/anal', `progress shows analysis stage (${S.job?.stage} ${S.job?.step}/${S.job?.total})`)
/* 5. 진행 중 중복 실행 → 거부 */
const n0 = calls.length
await runAnalysis()
ok(calls.length === n0 && lastBot() === t('busy'), 'duplicate run rejected while busy')
cancelJob()
await p
ok(!!S.built && lastBot() === t('job_cancelled') && !calls.some((c) => c.includes('TABLE')), 'cancel during analysis: waits, then stops; model kept')

console.log(fails ? `\n${fails} failed` : '\nall passed')
process.exit(fails ? 1 : 0)
