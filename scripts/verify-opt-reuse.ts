/* 최적화 결과 재사용 회귀 — 가짜 Gen(fetch 대체)으로 생성 → 해석 → 설계 검토 → 최적화 × 2.
   설계 검토 직후 최적화, 그리고 최적화 직후 다시 최적화할 때 1회차는 BEAMFORCE 를 다시 받지 않는다(처마 변위 지문만 확인).
   부재력은 TW 정답 세트 Gen 결과를 단면과 무관하게 돌려준다 — 흐름 검사용이며 구조 결과 검증은 아니다.
   실행: node --import tsx scripts/verify-opt-reuse.ts */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { decodeResults, FIXTURE } from './tw-golden'
import { resultTable, sectionAllTable } from './fake-gen'

;(globalThis as any).document = { documentElement: { lang: 'ko', dataset: {} } }
const fx = JSON.parse(gunzipSync(readFileSync(FIXTURE)).toString())
const results = decodeResults(fx.results)

let db: Record<string, Record<string, unknown>> = {}
const calls: string[] = []
/** 부재가 쓰는 단면을 지운 DELETE (Gen 은 경고 없이 지우고 부재는 없는 번호를 가리킨 채 남음 — 라이브 2026-10-27) */
const usedDeletes: string[] = []
/** 'tables' = 결과 표를 빈 응답으로 (Gen 결과 없음) */
let fault = ''
/* 최적화 회차 카드 — 작업이 끝나면 S.job 이 사라지므로 Gen 호출 때마다 사본 */
let rounds: any[] = []
const json = (o: unknown) => Response.json(o)
;(globalThis as any).fetch = async (url: string, init?: RequestInit) => {
  const path = new URL(url).pathname.replace(/^\/gen/, '')
  const method = init?.method ?? 'GET'
  const body = init?.body ? JSON.parse(String(init.body)) : {}
  if ((S as any)?.job?.rounds) rounds = structuredClone(S.job!.rounds)
  if (path === '/doc/saveas') return json({ message: 'MIDAS GEN NX command complete' })
  if (path === '/doc/new') { calls.push('doc/new'); db = {}; return json({}) }
  if (path === '/doc/anal') { calls.push('doc/anal'); return json({ message: 'ok' }) }
  if (path === '/post/TABLE') {
    const a = body.Argument
    calls.push(a.TABLE_TYPE)
    if (a.TABLE_TYPE === 'SECTIONALL') return json(sectionAllTable(db.SECT as Record<string, any>, a.TABLE_NAME))
    if (fault === 'tables') return json({})
    return json(resultTable(results, a) ?? {}) // 지점별 반력(Reaction)은 빈 응답 — 기초 검토만 생략
  }
  if (path.startsWith('/doc/') || path.startsWith('/view/') || path.startsWith('/post/')) return json({})
  const db_ = path.replace('/db/', '')
  if (method === 'PUT') {
    if (db_ === 'SECT') calls.push('put SECT')
    if (fault === 'elem' && db_ === 'ELEM') return Response.json({ message: 'failed' }, { status: 400 })
    const next = { ...db, [db_]: { ...db[db_], ...body.Assign } } as Record<string, Record<string, any>>
    /* Gen 처럼 — TRUSS 요소가 뒴 효과 단면을 참조하게 되는 PUT 은 거부. 이 시험의 최적화는 단면 번호가 밀려 옛 가새 번호에
       뒴 효과 단면이 오는 경우를 지난다(CN 라이브 2026-10-27 과 같은 오류 — updateSections 의 중간 단계가 없으면 실패) */
    if (Object.values(next.ELEM ?? {}).some((e) => e.TYPE === 'TRUSS' && next.SECT?.[e.SECT]?.SECT_BEFORE?.USE_WARPING_EFFECT))
      return Response.json({ message: `[Error] Section property considering 7th DOF can be assigned only to the beam elements.` }, { status: 400 })
    db = next
    return json({ [db_]: body.Assign })
  }
  if (method === 'GET') return json({ [db_]: structuredClone(db[db_] ?? {}) })
  if (method === 'DELETE') {
    const [name, id] = db_.split('/')
    calls.push(`delete ${name}/${id}`)
    if (fault === 'delete') return Response.json({ message: 'failed' }, { status: 400 })
    if (Object.values(db.ELEM ?? {}).some((e) => String(e.SECT) === id)) usedDeletes.push(id)
    const rec = db[name]?.[id]; delete db[name]?.[id]
    return json({ [name]: { [id]: rec } })
  }
  return json({})
}

const { S } = await import('../src/state/store')
const { setConfirmHandler } = await import('../src/components/ConfirmDialog')
setConfirmHandler(() => true)
const { msgText } = await import('../src/state/ui')
const { buildFactory, resendModel } = await import('../src/actions/build')
const { runAnalysis } = await import('../src/actions/analysis')
const { runDesignCheck } = await import('../src/actions/design')
const { runOptimize } = await import('../src/actions/optimize')
S.mapiKey = 'offline-opt-reuse'
S.code = 'TW'
const lastBot = () => { const m = [...S.msgs].reverse().find((x) => x.role === 'bot' && x.kind === 'html'); return m ? msgText(m) : '' }
/** 첫 재전송(단면 PUT — 그 자리 갱신이든 doc/new 재생성이든) 전까지 = 1회차 — 그 안에 BEAMFORCE 가 없어야 재사용 */
const firstRound = () => { const i = calls.findIndex((c) => c === 'doc/new' || c === 'put SECT'); return i < 0 ? calls : calls.slice(0, i) }

await buildFactory(structuredClone(fx.spec))
await runAnalysis()
await runDesignCheck()
assert.ok(S.design && S.results, `design check: ${lastBot()}`)
let passed = 0
/* 실행 전 결과 유지 — Gen 모델을 바꾸기 전에 멈추면 설계 검토 결과·산출물이 사라지지 않는다 */
{
  const keep = { results: S.results, design: S.design, connections: S.connections }
  const elem = db.ELEM as Record<string, any>, id = Object.keys(elem)[0], sect = elem[id].SECT
  elem[id].SECT = Object.keys(db.SECT).find((k) => +k !== sect) ? +Object.keys(db.SECT).find((k) => +k !== sect)! : sect
  await runOptimize()
  assert.ok(S.genChanged > 0, `Gen change detected: ${lastBot()}`)
  assert.ok(S.design === keep.design && S.results === keep.results && S.connections === keep.connections, 'Gen change: previous design check kept')
  elem[id].SECT = sect
  fault = 'tables'
  await runOptimize()
  assert.ok(S.design === keep.design && S.results === keep.results, `round-1 fetch failure: previous design check kept (${lastBot()})`)
  fault = ''
  passed += 3
}
let inPlace = false
for (const label of ['after design check', 'after optimization']) {
  calls.length = 0; rounds = []
  await runOptimize()
  assert.ok(S.opt && S.design, `optimize ${label}: ${lastBot()}`)
  /* 회차 카드 — 회차마다 무게·최대 강도비, 단면을 바꾼 회차는 바꾼 단면 */
  /* 마지막 사본은 마지막 Gen 호출 때라 마지막 회차 결과는 아직 없을 수 있다 */
  assert.ok(rounds.length === S.opt.iters.length && rounds.every((r, i) => r.it === i + 1 && (r.weight === undefined ? i === rounds.length - 1 : Math.abs(r.weight - S.opt!.iters[i].weight) < 1e-9 && r.maxRatio === S.opt!.iters[i].maxRatio)), `${label}: round cards (${JSON.stringify(rounds)})`)
  assert.ok(rounds.slice(0, -1).every((r) => r.next?.length && r.next.every((x: any) => x.before !== x.after)), `${label}: changed sections listed before the next round`)
  passed += 2
  assert.ok(firstRound().includes('DISPLACEMENTG'), `${label}: fingerprint read`)
  assert.ok(!firstRound().includes('BEAMFORCE'), `${label}: round 1 re-fetched BEAMFORCE (${firstRound().join(', ')})`)
  /* 단면을 바꿔도 형상이 같으면 문서를 새로 만들지 않음 (그 자리에서 단면·바뀐 하중 표만) */
  assert.ok(!calls.includes('doc/new'), `${label}: sections updated in place without doc/new`)
  inPlace ||= calls.includes('put SECT')
  passed += 3
}
assert.ok(inPlace, 'an optimization round changed sections in place (SECT PUT)')
passed++
/* 단면 수가 줄면(기둥을 지붕보와 같은 단면으로) 쓰지 않게 된 앱 단면 번호를 지운다 — 부재가 쓰는 번호는 지우지 않음 */
{
  const base = S.built!.spec, other = base.sections.rafter === 'RH 500x200x10x16' ? 'RH 450x200x9x14' : 'RH 500x200x10x16'
  await resendModel({ ...base, sections: { ...base.sections, column: other } })
  const n = Object.keys(db.SECT).length
  calls.length = 0
  await resendModel({ ...base, sections: { ...base.sections, column: base.sections.rafter } })
  const used = new Set(Object.values(db.ELEM as Record<string, any>).map((e) => String(e.SECT)))
  assert.ok(!calls.includes('doc/new') && calls.some((c) => c.startsWith('delete SECT/')) && Object.keys(db.SECT).length === n - 1, `merged sections: unused section removed in place (${calls.filter((c) => c.startsWith('delete')).join(', ')})`)
  assert.ok(Object.keys(db.SECT).every((id) => used.has(id)) && !usedDeletes.length, `no unused app section left, none in use deleted (${Object.keys(db.SECT)} / used ${[...used]} / ${usedDeletes})`)
  /* 지우기 실패는 정리일 뿐 — 갱신은 성공하고, 남은 번호는 다음 갱신에서 다시 지운다 */
  await resendModel({ ...base, sections: { ...base.sections, column: other } })
  fault = 'delete'
  await resendModel({ ...base, sections: { ...base.sections, column: base.sections.rafter } })
  fault = ''
  const leftover = Object.keys(db.SECT).filter((id) => !(id in S.built!.sent!.SECT) || !new Set(Object.values(db.ELEM as Record<string, any>).map((e) => String(e.SECT))).has(id))
  assert.ok(S.built!.spec.sections.column === base.sections.rafter && leftover.length === 1 && S.log.some((x) => x.type === 'warn'), `failed DELETE: update still succeeds, one unused id left (${leftover})`)
  /* 갱신 사이에 Gen 에서 추가한 단면(앱이 보내지 않은 번호)은 다시 읽은 SECT 에 섞여도 지우지 않는다 */
  db.SECT[99] = { ...db.SECT[1], SECT_NAME: 'ENGINEER 99' }
  calls.length = 0
  await resendModel({ ...base, sections: { ...base.sections, column: base.sections.rafter, girt: base.sections.purlin } })
  await resendModel({ ...base, sections: { ...base.sections, column: base.sections.rafter } })
  assert.ok('99' in db.SECT && !calls.includes('delete SECT/99'), 'section added in Gen between updates is not deleted')
  delete db.SECT[99]
  passed++
  assert.ok(calls.includes(`delete SECT/${leftover[0]}`) && !(leftover[0] in db.SECT), `leftover id removed on the next update (${calls.filter((c) => c.startsWith('delete'))})`)
  passed += 4
}
/* 앱 하중 모델에서 형상 표가 달라지면 그 자리 갱신(엔지니어 하중용 거부)이 아니라 모델 재생성 — inPlacePlan 의 {ok:false} 를 갱신 가능으로 읽던 회귀 */
{
  calls.length = 0
  await resendModel({ ...S.built!.spec, span: S.built!.spec.span + 2 })
  assert.ok(calls.includes('doc/new') && S.built!.spec.span === fx.spec.span + 2, `geometry change on an app-load model regenerates (${calls.slice(0, 6).join(', ')})`)
  passed++
}
/* 앱 하중 모델의 그 자리 갱신이 중간에 실패하면 모델을 비운다 (Gen 에 새 단면이 일부 들어간 상태 — 재생성 실패와 같은 처리) */
{
  const base = S.built!.spec
  fault = 'elem'
  let err: unknown
  try { await resendModel({ ...base, sections: { ...base.sections, column: base.sections.column === 'RH 500x200x10x16' ? 'RH 450x200x9x14' : 'RH 500x200x10x16' } }) } catch (e) { err = e }
  fault = ''
  assert.ok(err && S.built === null && !S.results && !S.design, `failed in-place update clears the app model (${err})`)
  passed++
}
console.log(`Optimizer result reuse: ${passed} checks passed (previous results kept when stopped before Gen changes; round 1 reuses results after a design check and after a previous optimization)`)
