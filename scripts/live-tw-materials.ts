/** Live (v2.4.9 TW): every profile material accepted (CNS(S)/ASTM(S) DB names), per-support reactions → footing check,
    ASD 2.2 combinations accepted + ASD member check, Z purlin via lipped-C proxy. Original document saved and restored (12 DB hashes).
    Usage: node --import tsx scripts/live-tw-materials.ts   (key from .env / stdin, never printed) */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { MidasClient } from 'midas-nx'
import { readMapiKey } from './mapi-key'

;(globalThis as any).document = { documentElement: { lang: 'ko', dataset: {} } }
const { S } = await import('../src/state/store')
const { DEFAULT_SPEC } = await import('../src/domain/types')
const { sendModel } = await import('../src/actions/build')
const { analyzeCore } = await import('../src/actions/analysis')
const { fetchResults } = await import('../src/actions/results')
const { runDesign } = await import('../src/domain/design')
const { runConnections } = await import('../src/domain/connections')
const { footingState } = await import('../src/state/footing')
const { setConfirmHandler } = await import('../src/components/ConfirmDialog')
const { TW } = await import('../src/codes/tw')
setConfirmHandler(() => true)
const key = await readMapiKey(), client = new MidasClient({ mapiKey: key, product: 'gen', timeout: 180000 })
S.mapiKey = key; S.code = 'TW'
const dbs = ['UNIT', 'MATL', 'SECT', 'NODE', 'ELEM', 'CONS', 'FRLS', 'STLD', 'LCOM-GEN', 'BODF', 'BMLD', 'CNLD']
const canonical = (x: unknown) => JSON.stringify(x, (_, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, v[k]])) : v)
const snapshot = async () => { const out: Record<string, string> = {}; for (const db of dbs) out[db] = createHash('sha256').update(canonical(await client.request('GET', `/db/${db}`))).digest('hex'); return out }
const command = async (path: string, arg: string) => { const j: any = await client.request('POST', path, { Argument: arg }); assert.equal(j.message, 'MIDAS GEN NX command complete', path) }
const t0 = Date.now(), log = (s: string) => console.log(`[${Math.round((Date.now() - t0) / 1000)}s] ${s}`)
const before = await snapshot(), backup = `C:/temp/sms_twv249_backup_${Date.now()}.mgbx`
await command('/doc/saveas', backup); log('backup saved')
try {
  /* 1. 재료 10종 */
  for (const [name, m] of Object.entries(TW.materials)) {
    await sendModel({ ...structuredClone(DEFAULT_SPEC), material: name })
    const matl: any = await client.request('GET', '/db/MATL')
    const p = (Object.values(matl.MATL ?? matl)[0] as any)?.PARAM?.[0]
    assert.ok(p && p.STANDARD === m.gen.standard && p.DB === m.gen.db, `${name}: Gen MATL ${JSON.stringify(p)}`)
    log(`material ${name}: ${m.gen.standard} ${m.gen.db} accepted`)
  }
  /* 2. ASD + Z 퍼린 + A572Gr50 — 생성·해석·결과·설계·접합·기초 */
  const spec = { ...structuredClone(DEFAULT_SPEC), material: 'A572Gr50', asd: true, sections: { ...DEFAULT_SPEC.sections, purlin: 'Z 200x75x20/3.2' } }
  await sendModel(spec)
  const b = S.built!
  const asdN = Object.values(b.info.comboKind).filter((k) => k === 'asd').length
  log(`model sent: combos ${b.comboNames.length} (ASD ${asdN}), purlin ${spec.sections.purlin} → Gen proxy`)
  const sect: any = await client.request('GET', '/db/SECT')
  const zrow = Object.values(sect.SECT ?? sect).find((x: any) => String(x.SECT_NAME).startsWith('Z')) as any
  assert.ok(zrow && zrow.SECT_BEFORE?.SECT_I?.SECT_NAME?.startsWith('CC'), `Z proxy in Gen: ${JSON.stringify(zrow?.SECT_BEFORE?.SECT_I)}`)
  await analyzeCore()
  log(`analysis: reactions ${S.reactions?.length}, per-support ${S.baseReactions?.size} nodes`)
  assert.ok(S.baseReactions && S.baseReactions.size === b.model.nodes.filter((n) => n.z === 0).length, 'per-support reactions for every base node')
  /* 절점 반력 합 = 케이스 합계 표 */
  for (const lc of ['D', 'LR', 'EX']) {
    const sum = [...S.baseReactions!.values()].reduce((a, m) => a.map((v, i) => v + m.get(lc)![i]), [0, 0, 0, 0, 0, 0])
    const tot = S.reactions!.find((r) => r.lc.replace(/\(ST\)$/, '') === lc)!
    assert.ok(Math.abs(sum[0] - tot.fx) < 0.05 && Math.abs(sum[1] - tot.fy) < 0.05 && Math.abs(sum[2] - tot.fz) < 0.05, `${lc}: node sum ${sum.slice(0, 3)} vs summation ${tot.fx},${tot.fy},${tot.fz}`)
  }
  log('per-support reactions sum to the summation table (D, LR, EX)')
  const res = await fetchResults(b)
  const d = runDesign(spec, b.model, b.info, res), cs = runConnections(spec, b.model, b.info, res)
  const asdGov = d.members.filter((m) => m.eq.startsWith('ASD')).length
  const byRole = (r: string) => d.members.filter((m) => m.role === r)
  const fmt = (r: string) => { const ms = byRole(r); return ms.length ? `${r} ${Math.max(...ms.map((m) => m.asd?.lrfd ?? m.ratio)).toFixed(3)}/${Math.max(...ms.map((m) => m.asd?.ratio ?? 0)).toFixed(3)}` : '' }
  log(`design: max ${d.maxRatio.toFixed(3)} NG ${d.ng}, ASD governs ${asdGov}/${d.members.length}; LRFD/ASD ${['column', 'rafter', 'purlin', 'girt', 'post', 'strut', 'brace'].map(fmt).join(' · ')}`)
  assert.ok(d.members.every((m) => m.asd), 'every member has an ASD check')
  log(`connections: ${cs.map((c) => `${c.type} ${c.ratio.toFixed(3)} (${c.combo})`).join(', ')}`)
  assert.ok(cs.every((c) => !c.combo.startsWith('ASD')), 'connections use LRFD combinations only')
  S.design = d
  const ft = footingState()
  assert.equal(ft.kind, 'result')
  if (ft.kind === 'result') log(`footing (qa 150, Df 1.5, t 0.6): ${ft.result.rows.map((r) => `${r.group} ${r.B}x${r.L} m bearing ${r.ratios.bearing.toFixed(3)} ecc ${r.ratios.eccentricity.toFixed(3)} slide ${r.ratios.sliding.toFixed(3)} (${r.governing.bearing})`).join(' | ')}; combos ${ft.result.combos}`)
  const errs = S.log.filter((l) => l.type === 'err').length
  log(`API errors ${errs}`)
} finally {
  try { await command('/doc/saveas', `C:/temp/sms_twv249_scratch_${Date.now()}.mgbx`) }
  finally { await command('/doc/open', backup); const after = await snapshot(); assert.deepEqual(after, before, 'Original document restoration mismatch'); log('restored original: 12 DB hashes match') }
}
