/* 스펙 입력 검증 회귀 — 기본 모델링·자유골조 공통 (planFields). 잘못된 값은 두 모드 모두 실행 차단, 기존 값으로 조용히 대체 전송 금지.
   실행: node --import tsx scripts/verify-input.ts */
;(globalThis as any).document = { documentElement: { lang: 'ko', dataset: {} } }
const { CN_DEFAULT_SPEC, DEFAULT_SPEC } = await import('../src/domain/types')
const { initVals, invalidFields, toSpec } = await import('../src/components/planFields')

let fails = 0, n = 0
const ok = (cond: boolean, msg: string) => { n++; if (!cond) { fails++; console.log(`NG  ${msg}`) } }
const bad = (spec: typeof DEFAULT_SPEC, free: boolean, patch: Record<string, string>) => {
  const vals = { ...initVals(spec), ...patch }
  return invalidFields(toSpec(spec, vals, free), vals, free).map((f) => f.path)
}

for (const [name, spec] of [['TW', DEFAULT_SPEC], ['CN', CN_DEFAULT_SPEC]] as const) {
  for (const free of [false, true]) {
    const tag = `${name} ${free ? 'free' : 'template'}`
    ok(bad(spec, free, {}).length === 0, `${tag}: defaults valid`)
    for (const [field, v] of [['span', ''], ['span', '-24'], ['span', 'abc'], ['span', 'NaN'], ['span', 'Infinity'], ['eaveHeight', '0'], ['sagRods', '1.5'], ['sagRods', '-1'],
      ['sections.column', 'RH 400x'], ['sections.column', 'XYZ'], ['material', 'NOPE']] as const)
      ok(bad(spec, free, { [field]: v }).includes(field), `${tag}: ${field}='${v}' rejected`)
    ok(bad(spec, free, { sagRods: '0' }).length === 0, `${tag}: sagRods 0 allowed (min 0)`)
  }
  /* 기본 모델링: 베이 수 정수·간격 양수 */
  ok(bad(spec, false, { bays: '5.5' }).includes('bays'), `${name} template: bays 5.5 rejected (no silent rounding)`)
  ok(bad(spec, false, { baySpacing: '-6' }).includes('baySpacing'), `${name} template: baySpacing −6 rejected`)
  /* 자유골조: 베이 목록 */
  for (const v of ['', '6, ,x', '6, 0, 6', '6, -6', 'abc', '6;6'])
    ok(bad(spec, true, { bayList: v }).includes('bayList'), `${name} free: bayList '${v}' rejected`)
  for (const v of ['6, 6, 7.5, 7.5, 6', '6 6 6', '6，6、7.5'])
    ok(!bad(spec, true, { bayList: v }).includes('bayList'), `${name} free: bayList '${v}' accepted`)
  /* 유효 입력은 그대로 스펙에 반영 */
  const vals = { ...initVals(spec), bayList: '6, 6, 7.5, 7.5, 6', span: '27' }
  const sp = toSpec(spec, vals, true)
  ok(sp.span === 27 && sp.bays === 5 && JSON.stringify(sp.bayList) === '[6,6,7.5,7.5,6]', `${name} free: valid list → bays 5, span 27`)
}
/* TW 전용 지진·풍 / CN 전용 칸 */
ok(bad(DEFAULT_SPEC, true, { 'seismic.SDS': '-0.1' }).includes('seismic.SDS'), 'TW free: SDS −0.1 rejected')
ok(bad(DEFAULT_SPEC, true, { 'wind.exposure': 'Z' }).includes('wind.exposure'), 'TW free: exposure Z rejected')
ok(bad(CN_DEFAULT_SPEC, true, { 'china.betaZ': '0.9' }).includes('china.betaZ'), 'CN free: βz 0.9 < 1 rejected')
ok(bad(CN_DEFAULT_SPEC, true, { 'china.alphaMax': '0.5' }).includes('china.alphaMax'), 'CN free: αmax 0.5 not in list rejected')

console.log(fails ? `Input validation: ${fails}/${n} failed` : `Input validation: ${n} checks passed`)
process.exit(fails ? 1 : 0)
