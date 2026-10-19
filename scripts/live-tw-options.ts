/** Live (TW): purlin/girt second material SSC400 + special systems, and rigid interior columns (multi 24+24).
    Run through live-guarded.ts (original document saved/restored). Key from .env, never printed. */
import assert from 'node:assert/strict'
;(globalThis as any).document = { documentElement: { lang: 'ko', dataset: {} } }
const { S } = await import('../src/state/store')
const { DEFAULT_SPEC, normalizeSpans } = await import('../src/domain/types')
const { sendModel } = await import('../src/actions/build')
const { analyzeCore } = await import('../src/actions/analysis')
const { fetchResults } = await import('../src/actions/results')
const { runDesign } = await import('../src/domain/design')
const { runConnections } = await import('../src/domain/connections')
const { setConfirmHandler } = await import('../src/components/ConfirmDialog')
const { readMapiKey } = await import('./mapi-key')
setConfirmHandler(() => true)
S.mapiKey = await readMapiKey(); S.code = 'TW'
const t0 = Date.now(), log = (s: string) => console.log(`[${Math.round((Date.now() - t0) / 1000)}s] ${s}`)
const cases = [
  ['SSC400 purlins/girts + SMF/SCBF', { ...structuredClone(DEFAULT_SPEC), secondaryMaterial: 'SSC400', seismic: { ...DEFAULT_SPEC.seismic, systemX: 'SMF' as const, Rx: 4.8, systemY: 'SCBF' as const, Ry: 3.6 } }],
  ['multi 24+24 rigid interior columns', normalizeSpans({ ...structuredClone(DEFAULT_SPEC), frame: 'multi' as const, spanList: [24, 24], interiorColumns: 'rigid' as const })],
] as const
for (const [name, spec] of cases) {
  await sendModel(spec as any)
  const b = S.built!
  await analyzeCore()
  /* 평형: 보낸 하중 합 + 반력 = 0 (LR) */
  const lr = S.reactions!.find((r) => r.lc.replace(/\(ST\)$/, '') === 'LR')!
  const q = b.info.roofLive * spec.span * spec.bays * spec.baySpacing
  assert.ok(Math.abs(Math.abs(lr.fz) - q) / q < 1e-4, `${name}: LR reaction ${lr.fz} vs ${q}`)
  const res = await fetchResults(b), d = runDesign(b.spec, b.model, b.info, res), cs = runConnections(b.spec, b.model, b.info, res)
  const role = (r: string) => Math.max(0, ...d.members.filter((m) => m.role === r).map((m) => m.ratio)).toFixed(3)
  log(`${name}: nodes ${b.model.nodes.length}, elems ${b.model.elements.length}, MATL ${Object.keys((b.sent as any).MATL ?? {}).length}; V X ${b.info.seismic.X.V.toFixed(1)} kN / Y ${b.info.seismic.Y.V.toFixed(1)} kN; max ${d.maxRatio.toFixed(3)} NG ${d.ng} (column ${role('column')} rafter ${role('rafter')} purlin ${role('purlin')} girt ${role('girt')}); conns ${cs.map((c) => `${c.type} ${c.ratio.toFixed(3)}`).join(', ')}; cf details ${d.cfDetails?.map((r) => `${r.role}.${r.item} ${r.ratio.toFixed(2)}`).join(' ')}`)
}
log(`API errors ${S.log.filter((l) => l.type === 'err').length}`)
