/* 그 자리 단면 갱신의 쓰지 않는 단면 지우기 라이브 확인 — live-guarded.ts 로 실행 (원본 저장·12 DB 복원).
   --probe: DELETE /db/SECT/<id> 동작만 (쓰지 않는 번호 / 부재가 쓰는 번호 — Gen 은 쓰는 번호도 경고 없이 지운다, 2026-10-27)
   기본: RC 받침 모델 → 기둥만 다른 단면(단면 하나 늘어 받침 번호 밀림) → 다시 지붕보와 같은 단면(줄어 받침 번호 당겨짐)
        → 남은 SECT 가 모두 부재가 쓰는 번호인지, Gen 동일성 검사·해석·설계 검토 통과
   실행: node --import tsx scripts/live-guarded.ts -- scripts/live-sect-delete.ts [--probe] */
;(globalThis as any).document = { documentElement: { lang: 'ko', dataset: {} } }
const { readMapiKey } = await import('./mapi-key')
const { S } = await import('../src/state/store')
const { setConfirmHandler } = await import('../src/components/ConfirmDialog')
setConfirmHandler(() => true)
const { DEFAULT_SPEC } = await import('../src/domain/types')
const { buildFactory, resendModel } = await import('../src/actions/build')
const { runAnalysis } = await import('../src/actions/analysis')
const { runDesignCheck } = await import('../src/actions/design')
const { mapi } = await import('../src/mapi/client')

S.mapiKey = await readMapiKey(); S.code = 'TW'
const t0 = Date.now(), sec = () => ((Date.now() - t0) / 1000).toFixed(0)
const last = () => { const m: any = S.msgs.at(-1); return typeof m?.html === 'string' ? m.html : JSON.stringify(m?.html ?? '') }
const get = async (db: string) => ((await mapi('GET', db)) as any)[db] as Record<string, any>
const state = async () => {
  const s = await get('SECT'), e = await get('ELEM'), used = new Set(Object.values(e).map((x) => String(x.SECT)))
  return { sect: Object.entries(s).map(([id, v]) => `${id}:${v.SECT_NAME}`).join(' '), elem: Object.keys(e).length, unused: Object.keys(s).filter((id) => !used.has(id)), missing: [...used].filter((id) => !(id in s)) }
}

if (process.argv.includes('--probe')) {
  await buildFactory(structuredClone(DEFAULT_SPEC))
  if (!S.built) throw new Error(`build failed: ${last()}`)
  console.log('after build:', await state())
  const sect = await get('SECT')
  await mapi('PUT', 'SECT', { Assign: { 90: { ...sect['1'], SECT_NAME: 'ORPHAN 90' } } })
  console.log('DELETE /db/SECT/90 →', JSON.stringify(await mapi('DELETE', '/db/SECT/90')))
  console.log('after delete 90:', await state())
  const elem = await get('ELEM'), uses = new Map<string, number>()
  for (const e of Object.values(elem)) uses.set(String(e.SECT), (uses.get(String(e.SECT)) ?? 0) + 1)
  const used = [...uses].sort((a, b) => a[1] - b[1])[0]
  console.log(`DELETE /db/SECT/${used[0]} (used by ${used[1]} elements) →`, JSON.stringify(await mapi('DELETE', `/db/SECT/${used[0]}`)))
  console.log('after delete used:', await state())
} else {
  const spec = structuredClone(DEFAULT_SPEC); spec.pedestal = { height: 1, b: 600, d: 600 }
  await buildFactory(spec)
  if (!S.built) throw new Error(`build failed: ${last()}`)
  console.log(`[${sec()}s] build:`, await state())
  const deletes = () => S.log.filter((x: any) => /DELETE/.test(String(x.html ?? x.text ?? ''))).length
  await resendModel({ ...spec, sections: { ...spec.sections, column: 'RH 500x200x10x16' } })
  console.log(`[${sec()}s] column split:`, await state(), 'DELETE calls', deletes())
  await resendModel({ ...spec, sections: { ...spec.sections, column: spec.sections.rafter } })
  const after = await state()
  console.log(`[${sec()}s] merged back:`, after, 'DELETE calls', deletes())
  await runAnalysis()
  if (!S.analyzed) throw new Error(`analysis failed (Gen sync?): ${last()}`)
  await runDesignCheck()
  if (!S.design) throw new Error(`design failed: ${last()}`)
  console.log(`[${sec()}s] analysis + design ok: max ${S.design.maxRatio.toFixed(4)}, pedestal ${S.design.pedestal ? 'checked' : '-'}`)
  if (after.unused.length || after.missing.length) throw new Error(`unused ${after.unused} / missing ${after.missing}`)
}
console.log('api errors:', S.log.filter((x: any) => x.type === 'err').length)
