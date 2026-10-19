import './_dom-stub'
import assert from 'node:assert/strict'
import { ccDims, cfCapacity, cfCheck, effWidth } from '../src/codes/twColdFormed'
import { distortionalTW } from '../src/codes/twDistortional'
import { capacity, compressionQ } from '../src/codes/twSteel'
import { sectionProps } from '../src/domain/sections'
import { defaultSpecFor } from '../src/domain/types'
import { krSynthetic } from './kr-synth'
import { runDesign } from '../src/domain/design'
import { blockedMembers } from '../src/domain/validity'
import { memberGrade } from '../src/domain/status'

let n = 0
const near = (a: number, b: number, tol = 1e-9) => { n++; assert.ok(Math.abs(a - b) <= tol, `${a} != ${b}`) }
const name = 'CC 200x100x20/2', g = ccDims(name), sp = sectionProps(name)
const E = 200000, Fy = 345, L = { Lx: 6000, Ly: 2000, Lt: 2000, Lb: 2000 }
const c = cfCapacity(name, sp, Fy, E, L, 1)
// 4.3-1..4: choose lambda=1 -> rho=.78, independent dimensionless anchor.
const w = 2 / 1.052 * Math.sqrt(E / Fy)
near(effWidth(4, w, 1, Fy, E) / w, .78)
// PDF p.67: 6.2-24..28 and p.104: 7.3-1..5, independent strength expressions.
const Mcrd = sp.Sx * c.FdB, My = sp.Sx * Fy
near(c.phiMnxBraced, .9 * (1 - .22 * Math.sqrt(Mcrd / My)) * Math.sqrt(Mcrd / My) * My / 1e6)
assert.ok(c.phiMnxBraced < c.phiMnxo); n++ // lateral restraint does not waive distortion
const short = cfCapacity(name, sp, Fy, E, { ...L, Lx: 50, Ly: 50, Lt: 50, Lb: 50 }, 1)
near(short.phiPnc, .85 * Math.min(short.Ae * short.Fn, sp.A * Fy) / 1e3)
// 8.2-3/4: low tension can relieve the compression edge; both edges required.
const f = { P: .1 * c.phiPnt, Mx: .8 * c.phiMnxLTB, My: 0, V: 0 }
near(cfCheck(c, f, false).ratio, Math.max(.1 + f.Mx / c.phiMnxt, -.1 + .8, f.Mx / c.phiMnxo))
// 6.4-3 denominator is the section strength Mnxo, not the distortional minimum.
near(cfCheck(c, { P: 0, Mx: .5 * c.phiMnxo, My: 0, V: .8 * c.phiVn }, true).ratio,
  Math.max(.5 * c.phiMnxo / c.phiMnxt, .5 * c.phiMnxo / c.phiMnxBraced, Math.hypot(.5, .8)))
// PDF pp.69/70/107 numerical transcription anchors (mm, MPa).
const d = ccDims('CC 200x75x20/3.2')
near(distortionalTW(d, E, 'flexure', 6000).Lcrd, 469.02427031953215, 1e-7)
near(distortionalTW(d, E, 'flexure', 6000).Fcrd, 645.2210466805684, 1e-7)
near(distortionalTW(d, E, 'compression', 6000).Lcrd, 1274.3762631848458, 1e-7)
near(distortionalTW(d, E, 'compression', 6000).Fcrd, 349.11578392745366, 1e-7)
near(distortionalTW(d, E, 'compression', 6000).stationaryLcrd, 518.4792549585794, 1e-7)
assert.ok(distortionalTW(d, E, 'compression', 6000).Fcrd < 945.2605261160783); n++
// 4.2: lipped flange limit is 60, not the 90 allowed for other stiffeners.
for (const [section, fy] of [['CC 200x130x20/2', Fy], [name, 551], [name, 164]] as const) {
  assert.equal(cfCapacity(section, sectionProps(section), fy, E, L, 1).applicable, false); n++
}
// Appendix 1 Qs, Qa and Q-adjusted column curve use tf/cm2, gross radii.
const h = sectionProps('RH 400x200x8/13'), fy = 2.5, e = 2100
const thin = { ...h, bf: 600, tf: 6, h: 300, tw: 6, rolled: false }
const kc = Math.max(.35, Math.min(.763, 4 / Math.sqrt(thin.h / thin.tw)))
const x = thin.bf / (2 * thin.tf) * Math.sqrt(fy / kc)
near(compressionQ(thin, fy, e, 80).Qs, 1840 / x ** 2)
const broadWeb = { ...h, h: 1600, tw: 8 }
assert.ok(compressionQ(broadWeb, fy, e, 50).Qa < 1); n++
const p = sectionProps('P 300x3')
near(compressionQ(p, fy, e, 80).Qa, 77 / (fy * 100) + 2 / 3)
const longP = { ...p, d: 1200 }
assert.equal(compressionQ(longP, fy, e, 80).applicable, false); n++
const q = compressionQ(thin, fy, e, 80), lc = 80 / Math.PI * Math.sqrt(fy / e)
const cp = capacity(thin, fy * 98.0665, e * 98.0665, { KLx: thin.rx * 80, KLy: thin.ry * 80, Lb: 500 }, 1, 100)
near(cp.phiPnc, .85 * thin.A / 100 * q.Qs * q.Qa * Math.exp(-.419 * q.Qs * q.Qa * lc ** 2) * fy * 9.80665, 1e-6)
const spec = { ...defaultSpecFor('TW'), sections: { ...defaultSpecFor('TW').sections, purlin: 'CC 200x130x20/2' } }
const syn = krSynthetic(spec), design = runDesign(spec, syn.model, syn.loads.info, syn.results)
assert.ok(blockedMembers(design) > 0); n++
assert.ok(design.members.filter((m) => m.role === 'purlin').every((m) => memberGrade(m).grade === 'fail')); n++

/* ── 립 Z형강 (v2.4.9): 치수 성질 손계산, 6.2-21, 압축 x0 = 0·rmin, Gen 대리 단면, 설계 경로 ── */
{
  const { TW_Z } = await import('../src/codes/twZ')
  const { genProxy, buildGenPayloads } = await import('../src/domain/gen')
  const { buildPortal } = await import('../src/domain/portal')
  const { sectionCatalogOptions } = await import('../src/domain/sectionCatalog')
  const { checkScope } = await import('../src/domain/scope')
  const { CC } = await import('../src/domain/catalog')
  const name = 'Z 200x75x20/3.2', z = sectionProps(name), c = sectionProps('CC 200x75x20/3.2')
  /* 중심선 h = 196.8, b = 71.8, cl = 18.4 */
  const t = 3.2, h = 196.8, b = 71.8, cl = 18.4
  const A = t * (h + 2 * b + 2 * cl), Iy = 2 * (t * b ** 3 / 12 + b * t * (b / 2) ** 2) + 2 * cl * t * b ** 2
  const Ixy = b * b * t * h / 2 + 2 * b * cl * t * (h / 2 - cl / 2)
  assert.ok(z.kind === 'Z' && Math.abs(z.A - A) < 1e-9 && Math.abs(z.Iy - Iy) < 1e-6 && Math.abs(z.Ixy! - Ixy) < 1e-6, 'Z A, Iy, Ixy hand calc'); n++
  assert.ok(Math.abs(z.Ix - c.Ix) < 1e-6 && Math.abs(z.A - c.A) < 1e-9 && Math.abs(z.J - c.J) < 1e-9 && z.Iy > c.Iy, 'Z vs same-size lipped C: A, Ix, J equal; Iy larger'); n++
  const Imin = (z.Ix + z.Iy) / 2 - Math.hypot((z.Ix - z.Iy) / 2, Ixy)
  assert.ok(Math.abs(z.Imin! - Imin) < 1e-6 && Imin < z.Iy && Imin > 0, 'Z principal Imin'); n++
  const L = { Lx: 6000, Ly: 2000, Lt: 2000, Lb: 2000 }
  const cz = cfCapacity(name, z, 235, 200000, L, 1), cc = cfCapacity('CC 200x75x20/3.2', c, 235, 200000, L, 1)
  /* 6.2-21: Fe = Cb π² E d (Iy/2) / (2 Sf L²) → Fc 전이식 */
  const Sf = z.Ix / 100, Fe = Math.PI ** 2 * 200000 * 200 * (z.Iy / 2) / (2 * Sf * 2000 ** 2)
  const Fc = Fe >= 2.78 * 235 ? 235 : Fe > 0.56 * 235 ? (10 / 9) * 235 * (1 - 10 * 235 / (36 * Fe)) : Fe
  assert.ok(Math.abs(cz.Fc - Fc) < 1e-9, `Z LTB 6.2-21 Fc ${cz.Fc.toFixed(2)} = ${Fc.toFixed(2)}`); n++
  assert.ok(Math.abs(cz.phiMnxBraced - cc.phiMnxBraced) < 1e-9 && Math.abs(cz.phiVn - cc.phiVn) < 1e-9, 'Z braced flexure / shear = lipped C (same flange-web elements)'); n++
  /* 압축: x0 = 0 → 휨비틀림 = min(σex, σt); 약한 주축 rmin 으로 휨좌굴 */
  const sEy = Math.PI ** 2 * 200000 / (2000 / Math.sqrt(z.Imin! / z.A)) ** 2
  assert.ok(cz.PEy * 1e3 / z.A - sEy < 1e-6 && Math.abs(cz.PEy * 1e3 / z.A - sEy) < 1e-6, 'Z compression minor principal axis'); n++
  /* 목록·Gen 대리·카탈로그·적용범위 */
  assert.ok(TW_Z.every((nm) => CC.includes(genProxy(nm))), 'every Z has a same-size CNS2020 lipped C proxy'); n++
  const spec = { ...defaultSpecFor('TW'), sections: { ...defaultSpecFor('TW').sections, purlin: name, girt: 'Z 150x65x20/2.3' } }
  const model = buildPortal(spec), gp = buildGenPayloads(spec, model)
  const zs = Object.values(gp.SECT as Record<string, any>).filter((x) => x.SECT_NAME.startsWith('Z'))
  assert.ok(zs.length === 2 && zs.every((x) => x.SECT_BEFORE.SHAPE === 'CC' && x.SECT_BEFORE.SECT_I.SECT_NAME.startsWith('CC ') && x.SECT_BEFORE.SECT_I.DB_NAME === 'CNS2020'), 'Gen SECT: Z name, CC DB proxy'); n++
  const opt = sectionCatalogOptions('TW', 'purlin', 'SN400B')
  assert.ok(TW_Z.every((nm) => opt.some((o) => o.name === nm && o.shape === 'Z' && o.materialSupport.SN400B?.status === 'preliminary')) && !sectionCatalogOptions('TW', 'column', 'SN400B').some((o) => o.shape === 'Z') && !sectionCatalogOptions('KR', 'purlin', 'SS275').some((o) => o.shape === 'Z'), 'Z in TW purlin/girt catalog only, preliminary'); n++
  assert.ok(checkScope(spec).issues.some((i) => i.key === 'twZPurlin') && !checkScope(defaultSpecFor('TW')).issues.some((i) => i.key === 'twZPurlin'), 'Z → scope warning'); n++
  const syn = krSynthetic(spec), d = runDesign(spec, syn.model, syn.loads.info, syn.results)
  const pz = d.members.filter((m) => m.role === 'purlin')
  assert.ok(pz.length > 0 && pz.every((m) => m.eq.startsWith('TW CF') || m.eq === 'KL/r') && pz.every((m) => Number.isFinite(m.ratio)), 'Z purlins designed through the cold-formed path'); n++
}
console.log(`TW cold-formed / Q: ${n} checks passed (original clauses, distortion, interactions, applicability and grading)`)
