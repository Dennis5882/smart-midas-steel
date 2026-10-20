/* 횡단면 형식 회귀 — 단경간 편경사(frame 'mono'). 박공은 TW/CN 정답 세트가 지킨다.
   형상(마루 없음·높은 처마·기둥/거트 높이·지붕 가새 2패널), 하중 평형(LR·지진), 양방향 X 풍(TW WX5~8),
   CN 적설 불균형 없음, 적용범위(높은 처마·TW 경고), 입력 충돌. 실행: node --import tsx scripts/verify-frames.ts */
;(globalThis as any).document = { documentElement: { lang: 'ko', dataset: {} } }
import assert from 'node:assert/strict'
const { DEFAULT_SPEC, CN_DEFAULT_SPEC } = await import('../src/domain/types')
const { buildPortal, portalGeometry } = await import('../src/domain/portal')
const { buildLoadPayloads } = await import('../src/domain/loads')
const { buildGenPayloads } = await import('../src/domain/gen')
const { checkScope } = await import('../src/domain/scope')
const { fieldConflicts, initVals, toSpec } = await import('../src/components/planFields')

let n = 0
const ok = (c: boolean, what: string) => { n++; assert.ok(c, what) }
const near = (a: number, b: number, tol: number, what: string) => { n++; assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${what}: ${a} vs ${b}`) }

function totals(spec: any, model: any, loads: any) {
  const node = new Map(model.nodes.map((x: any) => [x.id, x]))
  const out: Record<string, number[]> = {}
  for (const [id, rec] of Object.entries(loads.BMLD)) {
    const e = model.elements.find((x: any) => x.id === +id)!, a: any = node.get(e.n1)!, b: any = node.get(e.n2)!
    const L = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)
    for (const p of (rec as { ITEMS: any[] }).ITEMS) { const o = (out[p.LCNAME] ??= [0, 0, 0]); o[['GX', 'GY', 'GZ'].indexOf(p.DIRECTION)] += p.P[0] * L }
  }
  return out
}

for (const base of [DEFAULT_SPEC, CN_DEFAULT_SPEC]) {
  const code = base.code
  const spec = { ...structuredClone(base), frame: 'mono' as const }
  const G = portalGeometry(spec), model = buildPortal(spec), loads = buildLoadPayloads(spec, model)
  const high = spec.eaveHeight + spec.span * spec.roofSlope
  /* 형상 */
  ok(G.ridges.length === 0 && G.planes.length === 1 && G.planes[0].rising, `${code} mono: one rising plane, no ridge`)
  near(G.ridgeZ, high, 1e-12, `${code} mono: high eave = eave + span·slope`)
  near(G.rafterLen, Math.hypot(spec.span, spec.span * spec.roofSlope), 1e-12, `${code} mono: rafter length = full slope`)
  near(G.hMean, spec.eaveHeight + spec.span * spec.roofSlope / 2, 1e-12, `${code} mono: mean roof height = mid-span`)
  const tops = model.nodes.filter((p) => p.y === 0 && (p.x === 0 || p.x === spec.span)).reduce((m, p) => ({ ...m, [p.x]: Math.max(m[p.x] ?? 0, p.z) }), {} as Record<number, number>)
  near(tops[0], spec.eaveHeight, 1e-12, `${code} mono: low column top`)
  near(tops[spec.span], high, 1e-12, `${code} mono: high column top`)
  ok(G.girtZsAt(spec.span).length > G.girtZs.length, `${code} mono: high wall has more girt rows (${G.girtZsAt(spec.span).length} > ${G.girtZs.length})`)
  const ids = new Set<string>()
  ok(model.elements.every((e) => e.n1 !== e.n2 && !ids.has(`${Math.min(e.n1, e.n2)}-${Math.max(e.n1, e.n2)}`) && ids.add(`${Math.min(e.n1, e.n2)}-${Math.max(e.n1, e.n2)}`)), `${code} mono: no zero-length or duplicate elements`)
  /* 안정성: 지점이 아닌 절점은 모두 주부재(기둥·지붕보·풍주)에 걸려야 한다 — 2차부재는 양단 핀이라 2차부재만 모이면 메커니즘
     (라이브 2026-10-16: 편경사 박공 거트 끝이 낮은 기둥에 절점 없이 떠서 강도비 13,895) */
  for (const s of [spec, base]) {
    const m = buildPortal(s)
    const primary = new Set(m.elements.filter((e) => e.role === 'column' || e.role === 'rafter' || e.role === 'post').flatMap((e) => [e.n1, e.n2]))
    const loose = m.nodes.filter((p) => p.z > 0 && !primary.has(p.id))
    ok(loose.length === 0, `${code} ${s.frame ?? 'gable'}: every non-support node is on a primary member (loose: ${loose.slice(0, 3).map((p) => `${p.x},${p.y},${p.z}`).join(' ')})`)
  }
  const roofBraces = model.elements.filter((e) => e.role === 'brace' && e.face === 'roof')
  const node = new Map(model.nodes.map((p) => [p.id, p]))
  ok(roofBraces.every((e) => Math.abs(node.get(e.n1)!.x - node.get(e.n2)!.x) <= spec.span / 2 + 1e-9), `${code} mono: roof X braces split at mid-span (≤ span/2 wide)`)
  ok(model.nodes.filter(G.isDeflNode).length > 0 && model.nodes.filter(G.isRidgeNode).length === 0, `${code} mono: deflection nodes at mid-span, no ridge nodes`)
  /* Gen 페이로드 생성 */
  const gp = buildGenPayloads(spec, model)
  ok(Object.keys(gp.ELEM).length === model.elements.length, `${code} mono: Gen ELEM payload`)
  /* 하중 평형 */
  const tot = totals(spec, model, loads)
  const BL = spec.span * spec.bays * spec.baySpacing
  near(-tot.LR[2], loads.info.roofLive * BL, 1e-9, `${code} mono: LR total = q·B·L`)
  for (const lc of ['EX', 'EY'] as const) {
    const dir = lc === 'EX' ? 'FX' : 'FY'
    const s = Object.values(loads.CNLD).reduce((a: number, rec: any) => a + rec.ITEMS.filter((x: any) => x.LCNAME === lc).reduce((b: number, x: any) => b + x[dir], 0), 0)
    near(s, loads.info.seismic[lc === 'EX' ? 'X' : 'Y'].V, 1e-9, `${code} mono: ${lc} nodal sum = V`)
  }
  const cases = Object.values(loads.STLD).map((c: any) => c.NAME)
  if (code === 'TW') {
    /* 비대칭 → 반대 방향 X 풍(WX5~8) 추가, 방향 반대 */
    ok(['WX5', 'WX6', 'WX7', 'WX8'].every((c) => cases.includes(c)), 'TW mono: wind from the high side WX5–8')
    ok(tot.WX1[0] > 0 && tot.WX5[0] < 0, `TW mono: WX1 pushes +X (${tot.WX1[0].toFixed(1)}), WX5 pushes −X (${tot.WX5[0].toFixed(1)})`)
    const names = Object.values(loads['LCOM-GEN']).map((c: any) => c.NAME as string)
    ok(names.some((x) => x.includes('+EX-T')) && names.some((x) => x.includes('WY1-L')), 'TW mono: opposite-sign torsion and −X across-wind combinations')
    const gable = buildLoadPayloads(DEFAULT_SPEC, buildPortal(DEFAULT_SPEC))
    ok(['WX5', 'WY3'].every((c) => Object.values(gable.STLD).some((x: any) => x.NAME === c)) && 'LRFD 2.2-3 WX5' in gable.info.comboKind && 'LRFD 2.2-4 +EX-T' in gable.info.comboKind, 'TW gable: −X/−Y wind and (±E, ∓ET) are design combos (no symmetry omission)')
    {
      /* 거울상 하중 = 원래 하중의 x 대칭: 수평 합력 부호 반대·크기 같음, 상향력 같음 */
      const tg: Record<string, number[]> = {}
      const nd = new Map(buildPortal(DEFAULT_SPEC).nodes.map((n) => [n.id, n])), el = buildPortal(DEFAULT_SPEC).elements
      for (const [id, rec] of Object.entries(gable.BMLD) as [string, any][]) for (const it of rec.ITEMS) {
        const e = el[+id - 1], a = nd.get(e.n1)!, b = nd.get(e.n2)!, L = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)
        const v = (tg[it.LCNAME] ??= [0, 0, 0]); v[{ GX: 0, GY: 1, GZ: 2 }[it.DIRECTION as 'GX']] += it.P[0] * L
      }
      const close = (a: number, b: number) => Math.abs(a - b) < 1e-6 * Math.max(1, Math.abs(a))
      ok(close(tg.WX5[0], -tg.WX1[0]) && close(tg.WX5[2], tg.WX1[2]) && close(tg.WY3[1], -tg.WY1[1]) && close(tg.WY3[2], tg.WY1[2]), 'TW gable: opposite-direction loads are the reflection of the originals')
    }
  } else {
    /* GB 51022 표 4.3.2 항 1: 단坡는 균일(+ 반경간 4.3.5) — 불균형 SN1/SN2 없음 */
    const steep = { ...spec, span: 12, eaveHeight: 6, roofSlope: 0.5, china: { ...spec.china!, snow: 0.5 } } // 높은 처마 12 m
    const sl = buildLoadPayloads(steep, buildPortal(steep))
    const sc = Object.values(sl.STLD).map((c: any) => c.NAME)
    ok(sc.includes('SN') && !sc.includes('SN1'), 'CN mono 26.6°: uniform snow only (no SN1/SN2)')
    const gs = { ...structuredClone(CN_DEFAULT_SPEC), roofSlope: 0.5, china: { ...CN_DEFAULT_SPEC.china!, snow: 0.5 } }
    ok(Object.values(buildLoadPayloads(gs, buildPortal(gs)).STLD).some((c: any) => c.NAME === 'SN1'), 'CN gable 26.6°: unbalanced snow kept')
    /* 양방향 풍: GB 51022 그림 4.2.2-1(b) — 편坡도 풍상 B/2 = 2구역, 나머지 3구역 (양방향 케이스) */
    ok(tot.WX1[0] > 0 && tot.WX3[0] < 0, 'CN mono: both wind directions')
  }
  /* 적용범위 */
  const sc = checkScope(spec)
  ok(!sc.blocked && sc.issues.some((i) => i.key === 'monoTW') === (code === 'TW'), `${code} mono: in scope, TW warns about wind interpretation`)
  const tall = { ...spec, eaveHeight: 16, span: 30, roofSlope: 0.1 }
  ok(checkScope(tall).issues.some((i) => i.key === 'eaveHigh' && i.level === 'block'), `${code} mono: high eave 19 m > 18 blocked`)
  ok(!checkScope({ ...tall, frame: 'gable' }).blocked, `${code} gable same dims: eave 16 m allowed`)
  /* 입력 충돌 — 높은 처마는 경사 칸 오류 */
  const vals = { ...initVals(tall), frame: 'mono' }
  const cf = fieldConflicts(toSpec(tall, vals, false), vals, false)
  ok(cf.length === 1 && cf[0].field.path === 'roofSlope' && cf[0].text.includes('19'), `${code} mono: high-eave conflict on roof slope (${cf[0]?.text})`)
  ok(initVals(base).frame === 'gable' && toSpec(base, initVals(base), false).frame === 'gable', `${code}: frame field defaults to gable`)
}
/* ── 다경간 박공 ── */
const { quantities } = await import('../src/domain/quantities')
const { normalizeSpans } = await import('../src/domain/types')
for (const base of [DEFAULT_SPEC, CN_DEFAULT_SPEC]) {
  const code = base.code
  const spec = normalizeSpans({ ...structuredClone(base), frame: 'multi' as const, spanList: [24, 24] })
  const G = portalGeometry(spec), model = buildPortal(spec), loads = buildLoadPayloads(spec, model)
  ok(spec.span === 48, `${code} multi: span = sum of spans`)
  ok(G.ridges.join() === '12,36' && G.valleys.join() === '24' && G.planes.length === 4 && G.symmetric, `${code} multi: ridges 12/36, valley 24, 4 planes, symmetric`)
  const node = new Map(model.nodes.map((p) => [p.id, p]))
  const lean = model.elements.filter((e) => e.lean)
  ok(lean.length > 0 && lean.every((e) => e.role === 'column' && node.get(e.n1)!.x === 24), `${code} multi: leaning columns on the valley line (${lean.length})`)
  const gp = buildGenPayloads(spec, model)
  const leanTops = lean.filter((e) => !lean.some((o) => o.n1 === e.n2))
  ok(leanTops.every((e) => (gp.FRLS[e.id] as any)?.ITEMS[0].FLAG_J === '0000110'), `${code} multi: leaning column tops released (pinned)`)
  ok(lean.filter((e) => node.get(e.n1)!.z === 0).every((e) => (gp.CONS[e.n1] as any).ITEMS[0].CONSTRAINT === '1110000'), `${code} multi: leaning column bases pinned`)
  const primary = new Set(model.elements.filter((e) => e.role === 'column' || e.role === 'rafter' || e.role === 'post').flatMap((e) => [e.n1, e.n2]))
  ok(model.nodes.every((p) => p.z === 0 || primary.has(p.id)), `${code} multi: every non-support node on a primary member`)
  ok(model.elements.filter((e) => e.role === 'strut' && node.get(e.n1)!.x === 24).length === spec.bays, `${code} multi: valley strut line`)
  const tot = totals(spec, model, loads)
  near(-tot.LR[2], loads.info.roofLive * spec.span * spec.bays * spec.baySpacing, 1e-9, `${code} multi: LR total = q·B·L`)
  for (const lc of ['EX', 'EY'] as const) {
    const dir = lc === 'EX' ? 'FX' : 'FY'
    const sm = Object.values(loads.CNLD).reduce((a: number, rec: any) => a + rec.ITEMS.filter((x: any) => x.LCNAME === lc).reduce((b: number, x: any) => b + x[dir], 0), 0)
    near(sm, loads.info.seismic[lc === 'EX' ? 'X' : 'Y'].V, 1e-9, `${code} multi: ${lc} nodal sum = V`)
  }
  const cases = Object.values(loads.STLD).map((c: any) => c.NAME)
  ok(code === 'CN' ? !cases.includes('WX5') : cases.includes('WX5'), `${code} multi: ${code === 'CN' ? 'GB cases WX1–4 cover ±X' : '−X wind WX5–8 checked'}`)
  const uneq = normalizeSpans({ ...spec, spanList: [24, 18] })
  const uc = Object.values(buildLoadPayloads(uneq, buildPortal(uneq)).STLD).map((c: any) => c.NAME)
  ok(code === 'CN' || uc.includes('WX5'), `${code} multi unequal spans: mirrored X wind (TW)`)
  /* 물량: 주각 = 기둥 3열 × 프레임, 마루 = 2 × 프레임 */
  const frames = spec.bays + 1
  const conn = (type: string, kind: string) => ({ type, ratio: 0.5, checks: [], notes: [], dims: {}, parts: { plates: [{ part: 'plate', width: 400, length: 500, thickness: 30, count: 1, estimated: false }], fasteners: [{ kind, diameter: 24, count: 4 }] } }) as any
  const q = quantities(spec, model, [conn('base', 'anchor'), conn('apex', 'bolt')])
  ok(q.plates.filter((r) => r.type === 'base').every((r) => r.conns === 3 * frames) && q.plates.filter((r) => r.type === 'apex').every((r) => r.conns === 2 * frames), `${code} multi: connection counts base ${3 * frames}, apex ${2 * frames}`)
  /* 적용범위·입력 */
  const sc = checkScope({ ...spec, features: { crane: false, mezzanine: false, multiSpan: true, opening: false } })
  ok(!sc.blocked && sc.issues.some((i) => i.key === 'multi') && sc.issues.some((i) => i.key === 'multiTW') === (code === 'TW'), `${code} multi: in scope with multi-span flag, warnings`)
  ok(checkScope({ ...spec, features: { crane: true, mezzanine: false, multiSpan: false, opening: false } }).issues.some((i) => i.key === 'additionInput' && i.level === 'block'), `${code} multi + crane: blocked until crane inputs are supplied and confirmed`)
  ok(checkScope(normalizeSpans({ ...spec, spanList: [36, 30] })).blocked === false && checkScope(normalizeSpans({ ...spec, spanList: [62, 24] })).blocked, `${code} multi: span limit per span (66 total ok, 62 single blocked)`)
  const vals = { ...initVals(base), frame: 'multi', spanList: '24, 30' }
  const sp2 = toSpec(base, vals, false)
  ok(sp2.frame === 'multi' && sp2.span === 54 && sp2.spanList?.join() === '24,30', `${code} multi: card → span 54 from 24 + 30`)
  const v3 = { ...initVals(base), frame: 'multi', spanList: '24, 70' }
  const cf = fieldConflicts(toSpec(base, v3, false), v3, false)
  ok(cf.some((c) => c.field.path === 'spanList'), `${code} multi: 70 m span conflict on the span list`)
}
{
  /* TW 表2.8 鋸齒狀屋頂: 4경간 = 8면, 풍상부터 D·E·D′·E′·D″·E″·D‴·E‴ → 면 4·5 = −0.5, 6·7 = −0.4, 8 = −0.3 (WX1, 면 내부 퍼린 GZ 비교) */
  const sp = normalizeSpans({ ...structuredClone(DEFAULT_SPEC), frame: 'multi' as const, spanList: [18, 18, 18, 18] })
  const G = portalGeometry(sp), m = buildPortal(sp), L = buildLoadPayloads(sp, m)
  const node = new Map(m.nodes.map((p) => [p.id, p]))
  const gz = (pl: number) => {
    const P = G.planes[pl], xm = G.xs.find((x) => x > P.xa + 1e-6 && x < P.xb - 1e-6 && !G.isRidge(x))!
    const e = m.elements.find((el) => el.role === 'purlin' && node.get(el.n1)!.x === xm && node.get(el.n1)!.y === 0)!
    return ((L.BMLD[e.id] as any).ITEMS as any[]).find((it) => it.LCNAME === 'WX1' && it.DIRECTION === 'GZ').P[0] as number
  }
  const v = Array.from({ length: 8 }, (_, i) => gz(i))
  near(v[3], v[4], 1e-12, 'TW 表2.8: E′ = D″ (−0.5)'); near(v[5], v[6], 1e-12, 'TW 表2.8: E″ = D‴ (−0.4)')
  ok(Math.abs(v[3] - v[5]) > 1e-6 && Math.abs(v[5] - v[7]) > 1e-6, `TW 表2.8: −0.5 → −0.4 → −0.3 steps (${v.map((x) => x.toFixed(3)).join(' ')})`)
  near(v[1], v[2], 1e-12, 'TW 表2.8: E = D′ (表2.5 풍하)')
}
{
  /* CN 다경간 26.6°: GB 51022 표 4.3.2 항 3 — 균일 + 골 1.4·2.0 (SV1·SV2), 불균형 SN1 없음, 적용범위 통과 */
  const steep = normalizeSpans({ ...structuredClone(CN_DEFAULT_SPEC), frame: 'multi' as const, spanList: [12, 12], eaveHeight: 6, roofSlope: 0.5, china: { ...CN_DEFAULT_SPEC.china!, snow: 0.5 } })
  const sc = Object.values(buildLoadPayloads(steep, buildPortal(steep)).STLD).map((c: any) => c.NAME)
  ok(sc.includes('SN') && sc.includes('SV1') && sc.includes('SV2') && !sc.includes('SN1') && !checkScope(steep).blocked, 'CN multi 26.6°: uniform + valley snow (GB 51022 4.3.2), not blocked')
}
/* ── 한 지붕 다경간 (마루 1 + 내부 흔들림 기둥) ── */
{
  const { defaultSpecFor, columnSpans } = await import('../src/domain/types')
  for (const base of [DEFAULT_SPEC, CN_DEFAULT_SPEC, defaultSpecFor('KR')]) {
    const code = base.code
    const spec = normalizeSpans({ ...structuredClone(base), frame: 'gableCols' as const, spanList: [16, 16, 16] })
    const G = portalGeometry(spec), model = buildPortal(spec), loads = buildLoadPayloads(spec, model)
    ok(spec.span === 48 && columnSpans(spec).join() === '16,16,16', `${code} gableCols: span 48 from 16+16+16`)
    ok(G.frame === 'gableCols' && G.ridges.join() === '24' && G.planes.length === 2 && G.valleys.length === 0 && G.leanXs.join() === '16,32' && G.symmetric, `${code} gableCols: one ridge, 2 planes, interior columns 16/32`)
    near(G.ridgeZ, spec.eaveHeight + 24 * spec.roofSlope, 1e-12, `${code} gableCols: ridge height from the full width`)
    const node = new Map(model.nodes.map((p) => [p.id, p]))
    const lean = model.elements.filter((e) => e.lean)
    ok(lean.length > 0 && lean.every((e) => e.role === 'column' && [16, 32].includes(node.get(e.n1)!.x)), `${code} gableCols: leaning columns on lines 16/32`)
    const leanTops = lean.filter((e) => !lean.some((o) => o.n1 === e.n2))
    ok(leanTops.every((e) => Math.abs(node.get(e.n2)!.z - G.zAt(node.get(e.n2)!.x)) < 1e-9), `${code} gableCols: interior column tops on the roof line`)
    const rafterNodes = new Set(model.elements.filter((e) => e.role === 'rafter').flatMap((e) => [e.n1, e.n2]))
    ok(leanTops.every((e) => rafterNodes.has(e.n2)), `${code} gableCols: interior column tops are rafter nodes`)
    const gp = buildGenPayloads(spec, model)
    ok(leanTops.every((e) => (gp.FRLS[e.id] as any)?.ITEMS[0].FLAG_J === '0000110'), `${code} gableCols: leaning column tops pinned`)
    ok(lean.filter((e) => node.get(e.n1)!.z === 0).every((e) => (gp.CONS[e.n1] as any).ITEMS[0].CONSTRAINT === '1110000'), `${code} gableCols: leaning column bases pinned`)
    const primary = new Set(model.elements.filter((e) => e.role === 'column' || e.role === 'rafter' || e.role === 'post').flatMap((e) => [e.n1, e.n2]))
    ok(model.nodes.every((p) => p.z === 0 || primary.has(p.id)), `${code} gableCols: every non-support node on a primary member`)
    ok([16, 32].every((x) => model.elements.filter((e) => e.role === 'strut' && node.get(e.n1)!.x === x).length === spec.bays), `${code} gableCols: strut line over each interior column`)
    ok(!G.postXs.some((x) => [16, 32].includes(x)), `${code} gableCols: no gable post on an interior column line`)
    /* 지붕 분담폭 합 = 지붕 경사 길이 전체 (절점 간격이 고르지 않아도) */
    near(G.xs.reduce((a, x) => a + G.roofTrib(x).reduce((b, r) => b + r.trib, 0), 0), 2 * G.slopeLen, 1e-9, `${code} gableCols: tributary widths sum to the roof length`)
    ok(G.deflXs.length === 3 && G.deflXs.every((x, i) => Math.abs(x - (8 + 16 * i)) <= G.sRoof), `${code} gableCols: deflection check near each column-span midpoint`)
    const tot = totals(spec, model, loads)
    near(-tot.LR[2], loads.info.roofLive * spec.span * spec.bays * spec.baySpacing, 1e-9, `${code} gableCols: LR total = q·B·L`)
    for (const lc of ['EX', 'EY'] as const) {
      const dir = lc === 'EX' ? 'FX' : 'FY'
      const sm = Object.values(loads.CNLD).reduce((a: number, rec: any) => a + rec.ITEMS.filter((x: any) => x.LCNAME === lc).reduce((b: number, x: any) => b + x[dir], 0), 0)
      near(sm, loads.info.seismic[lc === 'EX' ? 'X' : 'Y'].V, 1e-9, `${code} gableCols: ${lc} nodal sum = V`)
    }
    /* 지붕 풍압·적설 = 같은 폭의 단경간 박공 (지붕 형상이 같음) */
    const plain = { ...structuredClone(base), span: 48 }
    const pl = buildLoadPayloads(plain, buildPortal(plain))
    ok(JSON.stringify(loads.info.wind.cases.map((c: any) => [c.name, c.dir, +c.roofCp.toFixed(9), c.gcpi])) === JSON.stringify(pl.info.wind.cases.map((c: any) => [c.name, c.dir, +c.roofCp.toFixed(9), c.gcpi])), `${code} gableCols: wind cases/roof Cp = 48 m gable`)
    ok(Object.values(loads.STLD).map((c: any) => c.NAME).join() === Object.values(pl.STLD).map((c: any) => c.NAME).join(), `${code} gableCols: same load cases as the gable (no valley snow / saw-tooth wind)`)
    near(-tot.D?.[2] || 1, -(totals(plain, buildPortal(plain), pl).D?.[2]) || 1, 0.2, `${code} gableCols: roof dead load close to the plain gable`)
    /* 물량: 주각 = 기둥 4열 × 프레임, 마루 = 1 × 프레임 */
    const frames = spec.bays + 1
    const conn = (type: string, kind: string) => ({ type, ratio: 0.5, checks: [], notes: [], dims: {}, parts: { plates: [{ part: 'plate', width: 400, length: 500, thickness: 30, count: 1, estimated: false }], fasteners: [{ kind, diameter: 24, count: 4 }] } }) as any
    const q = quantities(spec, model, [conn('base', 'anchor'), conn('apex', 'bolt')])
    ok(q.plates.filter((r) => r.type === 'base').every((r) => r.conns === 4 * frames) && q.plates.filter((r) => r.type === 'apex').every((r) => r.conns === frames), `${code} gableCols: connection counts base ${4 * frames}, apex ${frames}`)
    /* 적용범위·입력 */
    const sc = checkScope({ ...spec, features: { crane: false, mezzanine: false, multiSpan: true, opening: false } })
    ok(!sc.blocked && sc.issues.some((i) => i.key === 'gableCols') && !sc.issues.some((i) => i.key === 'multi' || i.key === 'multiTW' || i.key === 'multiKR'), `${code} gableCols: in scope, own warning only`)
    for (const fr of ['gableCols', 'multi'] as const) ok(checkScope({ ...spec, frame: fr, features: { crane: true, mezzanine: false, multiSpan: false, opening: false } }).issues.some((i) => i.key === 'craneInterior' && i.level === 'block'), `${code} ${fr} + crane: blocked (full-width crane cannot pass interior columns)`)
    ok(!checkScope(normalizeSpans({ ...spec, spanList: [36, 36] })).blocked && checkScope(normalizeSpans({ ...spec, spanList: [62, 24] })).blocked, `${code} gableCols: span limit per column span (72 total ok, 62 blocked)`)
    const sp2 = toSpec(base, { ...initVals(base), frame: 'gableCols', spanList: '24, 30' }, false)
    ok(sp2.frame === 'gableCols' && sp2.span === 54 && sp2.spanList?.join() === '24,30', `${code} gableCols: card → span 54 from 24 + 30`)
    const uneq = normalizeSpans({ ...spec, spanList: [30, 18] })
    ok(!portalGeometry(uneq).symmetric, `${code} gableCols: unequal column spans → not symmetric (mirrored X loads)`)
  }
}

/* ── 트러스 지붕 (TW, v2.4.9): 하현재·Pratt 웨브, TRUSS 요소, 평형, 설계 경로, 접합 게이트, 적용범위 ── */
{
  const { withTrussDefaults, defaultTrussDepth } = await import('../src/domain/types')
  const { krSynthetic } = await import('./kr-synth')
  const { runDesign } = await import('../src/domain/design')
  const { runConnections } = await import('../src/domain/connections')
  const { quantities } = await import('../src/domain/quantities')
  const { buildDxf, buildDrawingSvgs } = await import('../src/drawing/drawings')
  const { proposeSections } = await import('../src/domain/optimize')
  const spec = withTrussDefaults({ ...structuredClone(DEFAULT_SPEC), span: 30, frame: 'truss' as const })
  const G = portalGeometry(spec), model = buildPortal(spec), node = new Map(model.nodes.map((p) => [p.id, p]))
  const d = defaultTrussDepth(30)
  ok(d === 1.5 && G.truss?.depth === 1.5 && Math.abs(G.truss.zb - (spec.eaveHeight - 1.5)) < 1e-12, 'truss: depth span/20 = 1.5 m, zb = eave − 1.5')
  const ys = [...new Set(model.nodes.map((p) => +p.y.toFixed(4)))].sort((a, b) => a - b), inner = ys.slice(1, -1)
  const chords = model.elements.filter((e) => e.role === 'chord'), webs = model.elements.filter((e) => e.role === 'web')
  const panels = G.xs.length - 1
  ok(chords.length === panels * inner.length && chords.every((e) => node.get(e.n1)!.z === G.truss!.zb && node.get(e.n2)!.z === G.truss!.zb), `truss: bottom chord ${panels} panels × ${inner.length} interior frames at zb`)
  ok(webs.length === (panels - 1 + panels) * inner.length, 'truss: verticals at interior panel points + one Pratt diagonal per panel')
  ok(!chords.some((e) => [ys[0], ys.at(-1)].includes(+node.get(e.n1)!.y.toFixed(4))), 'truss: gable frames keep rafter + posts (no chord)')
  /* Pratt: 경사재는 지지점 쪽 상현 → 중앙 쪽 하현 */
  const mid = spec.span / 2
  const diag = webs.filter((e) => node.get(e.n1)!.x !== node.get(e.n2)!.x)
  ok(diag.every((e) => { const a = node.get(e.n1)!, b = node.get(e.n2)!; return a.z > b.z && Math.abs(b.x - mid) < Math.abs(a.x - mid) }), 'truss: Pratt diagonals top-outer → bottom-inner')
  /* 기둥에 zb 절점, 모든 절점 연결 */
  ok(model.elements.filter((e) => e.role === 'column' && inner.includes(+node.get(e.n1)!.y.toFixed(4))).some((e) => Math.abs(node.get(e.n2)!.z - G.truss!.zb) < 1e-9), 'truss: column node at bottom-chord level')
  const deg = new Map<number, number>(); for (const e of model.elements) for (const k of [e.n1, e.n2]) deg.set(k, (deg.get(k) ?? 0) + 1)
  ok(model.nodes.every((p) => p.z === 0 || (deg.get(p.id) ?? 0) >= 2), 'truss: no dangling node')
  const gp = buildGenPayloads(spec, model)
  ok(webs.every((e) => (gp.ELEM[e.id] as any).TYPE === 'TRUSS') && chords.every((e) => (gp.ELEM[e.id] as any).TYPE === 'BEAM'), 'Gen: webs TRUSS, chords BEAM')
  ok(Object.values(gp.SECT as Record<string, any>).filter((x) => x.SECT_NAME === spec.sections.web!.replace(/ /g, '')).every((x) => x.SECT_BEFORE.USE_WARPING_EFFECT === false), 'Gen: web section without warping DOF (TRUSS)')
  const loads = buildLoadPayloads(spec, model), tot = totals(spec, model, loads)
  near(-tot.LR[2], loads.info.roofLive * spec.span * spec.bays * spec.baySpacing, 1e-9, 'truss: LR total = q·B·L (roof on top chord)')
  const plain = { ...structuredClone(DEFAULT_SPEC), span: 30 }
  ok(JSON.stringify(loads.info.wind.cases) === JSON.stringify(buildLoadPayloads(plain, buildPortal(plain)).info.wind.cases), 'truss: same wind cases as the gable of the same width')
  /* 설계·접합·물량·도면 */
  const syn = krSynthetic(spec), des = runDesign(spec, syn.model, syn.loads.info, syn.results)
  const dm = (r: string) => des.members.filter((m) => m.role === r)
  ok(dm('chord').length === chords.length && dm('web').length === webs.length && dm('web').every((m) => m.part === -1), 'design: chords (beam-column) and webs (axial) checked')
  ok(dm('chord').every((m) => m.lengths.KLy === 3 * m.lengths.KLx), 'design: bottom chord out-of-plane = 3 panels (assumed)')
  const topEls = dm('rafter').filter((m) => inner.includes(+node.get(syn.model.elements.find((e) => e.id === m.id)!.n1)!.y.toFixed(4)))
  ok(topEls.length > 0 && topEls.every((m) => m.lengths.KLx < 3000), 'design: top chord KLx = panel length on truss frames')
  const cs = runConnections(spec, syn.model, syn.loads.info, syn.results)
  ok(!cs.some((c) => c.type === 'knee' || c.type === 'apex') && cs.some((c) => c.type === 'base'), 'connections: no end-plate knee/apex on truss frames')
  const q = quantities(spec, syn.model, cs)
  ok(q.members.some((r: any) => r.role === 'chord') && q.members.some((r: any) => r.role === 'web'), 'quantities: chord and web rows')
  const dxf = buildDxf({ spec, model: syn.model, connections: cs, title: 't' }), svgs = buildDrawingSvgs({ spec, model: syn.model, connections: cs, title: 't' })
  ok(dxf.includes('CHORD') && dxf.includes('WEB') && svgs.length > 0, 'drawings: DXF layers CHORD/WEB, SVG sheets')
  const prop = proposeSections(spec, syn.model, syn.loads.info, syn.results, des)
  ok(prop.rows.some((r) => r.role === 'chord') && prop.rows.some((r) => r.role === 'web') && prop.rows.some((r) => r.role === 'column'), 'optimizer sizes chord/web/column on truss frames')
  /* 적용범위·입력 */
  ok(checkScope(spec).issues.some((i) => i.key === 'truss' && i.level === 'warn') && !checkScope(spec).blocked, 'scope: truss warning (TW)')
  ok(checkScope({ ...withTrussDefaults({ ...structuredClone(CN_DEFAULT_SPEC), frame: 'truss' as const }) }).issues.some((i) => i.key === 'trussCode' && i.level === 'block'), 'scope: truss blocked outside TW')
  ok(checkScope({ ...spec, trussDepth: spec.eaveHeight - 1 }).issues.some((i) => i.key === 'trussDepth'), 'scope: truss depth too large blocked')
  const sp2 = toSpec(DEFAULT_SPEC, { ...initVals(DEFAULT_SPEC), frame: 'truss' }, false)
  ok(sp2.frame === 'truss' && !!sp2.sections.chord && !!sp2.sections.web && sp2.trussDepth === defaultTrussDepth(DEFAULT_SPEC.span), 'card → truss with default chord/web/depth')
}

/* 풍하중 미리보기 (하중 단계 표) — 실제 페이로드 합산: TW 수평 합력 = W_D, 부분 개방이면 내압 케이스 상향력 증가, KR·CN 케이스 수·방향 */
{
  const { windSummary } = await import('../src/domain/windSummary')
  const { KR_DEFAULT_SPEC } = await import('../src/domain/types')
  const sumOf = (spec: typeof DEFAULT_SPEC) => { const m = buildPortal(spec), L = buildLoadPayloads(spec, m); return { w: windSummary(m, L), L } }
  const tw = sumOf(DEFAULT_SPEC)
  const wx = tw.w.rows.filter((r) => r.kind === 'main' && r.dir === '+X')
  ok(wx.length === 4 && Math.abs(Math.max(...wx.map((r) => r.horizontal)) - tw.L.info.wind.across.WDx) < 1e-6, 'wind preview TW: +X horizontal = W_D')
  ok(tw.w.rows.some((r) => r.kind === 'torsion') && tw.w.rows.filter((r) => r.kind === 'across').length === 2, 'wind preview TW: across-wind ×2 + torsion')
  ok(wx.every((r) => r.uplift > 0) && wx[0].gcpi! > 0 && wx[1].gcpi! < 0 && wx[0].uplift > wx[1].uplift, 'wind preview TW: +internal case has larger uplift')
  const part = sumOf({ ...DEFAULT_SPEC, wind: { ...DEFAULT_SPEC.wind, enclosure: 'partial' } }).w.rows.find((r) => r.name === 'WX1')!
  ok(part.gcpi! > 1 && part.uplift > wx[0].uplift * 1.3, `wind preview TW: partially enclosed raises uplift (${wx[0].uplift.toFixed(0)} → ${part.uplift.toFixed(0)} kN)`)
  const cn = sumOf(CN_DEFAULT_SPEC).w
  ok(['+X', '-X', '+Y', '-Y'].every((d) => cn.rows.filter((r) => r.dir === d).length === 2), 'wind preview CN: 4 directions × ±i')
  const kr = sumOf(KR_DEFAULT_SPEC).w
  ok(kr.rows.filter((r) => r.kind === 'main').length >= 8 && kr.rows.every((r) => r.kind === 'torsion' || r.horizontal > 0), 'wind preview KR: main cases with horizontal force')
}

console.log(`Frames: ${n} checks passed (mono-slope + multi-span + TW 表2.8: geometry, releases, loads, wind, snow, scope, quantities, inputs)`)
