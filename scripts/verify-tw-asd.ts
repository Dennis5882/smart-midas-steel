/* 대만 ASD(容許應力設計法) 부재 검토 회귀 — 원문식 손계산 대조 (Gen·키 불필요)
   node --import tsx scripts/verify-tw-asd.ts */
import './_dom-stub'
import assert from 'node:assert/strict'
import { asdAllowable, asdCb, asdCheck, asdFa, ASD_COMBOS, cfAsdScale } from '../src/codes/twAsd'
import { dimensionSectionProps } from '../src/domain/sections'
import { defaultSpecFor, DEFAULT_SPEC } from '../src/domain/types'
import { buildPortal } from '../src/domain/portal'
import { buildLoadPayloads } from '../src/domain/loads'
import { runDesign } from '../src/domain/design'
import { runConnections } from '../src/domain/connections'
import { checkScope } from '../src/domain/scope'
import { krSynthetic } from './kr-synth'
let n = 0
const ok = (c: unknown, m: string) => { assert.ok(c, m); n++ }
const near = (a: number, b: number, tol: number, m: string) => ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${m}: ${a} vs ${b}`)
const Fy = 235 / 98.0665, E = 200000 / 98.0665

/* 1. 6.3 Fa — Cc 경계 연속, 탄성 23/12 */
{
  const Cc = Math.sqrt(2 * Math.PI ** 2 * E / Fy)
  near(asdFa(Fy, E, 0), Fy / (5 / 3), 1e-12, 'Fa(0) = Fy/1.667')
  near(asdFa(Fy, E, Cc - 1e-9), asdFa(Fy, E, Cc + 1e-9), 1e-6, 'Fa continuous at Cc')
  near(asdFa(Fy, E, 150), 12 * Math.PI ** 2 * E / (23 * 150 ** 2), 1e-12, 'Fa elastic (6.3-2)')
  const r = 80 / Cc
  near(asdFa(Fy, E, 80), (1 - r * r / 2) * Fy / (5 / 3 + 3 / 8 * r - r ** 3 / 8), 1e-12, 'Fa inelastic (6.3-1) KL/r 80')
}
/* 2. 7.2 강축 — 結實 RH400x200x8x13: Lb ≤ Lc → 0.66Fy, Lb > Lc → 7.2-6/7/8 */
{
  const sp = dimensionSectionProps('RH 400x200x8x13')
  const a = asdAllowable(sp, 235, 200000, { KLx: 6000, KLy: 2000, Lb: 2000 }, 1)
  ok(a.compact === 'compact', 'RH400x200 compact (b/2t 7.7 ≤ 17/√Fy, h/tw 46.8 ≤ 170/√Fy)')
  near(a.Fbx, 0.66 * Fy, 1e-12, 'Lb 200 cm ≤ Lc 258 cm → 0.66Fy (7.2-1)')
  near(a.Fby, 0.75 * Fy, 1e-12, 'weak axis compact 0.75Fy (7.3-1)')
  near(a.Ft, 0.6 * Fy, 1e-12, 'Ft 0.6Fy (5.2)'); near(a.Fv, 0.4 * Fy, 1e-12, 'Fv 0.4Fy (7.5-1)')
  const b = asdAllowable(sp, 235, 200000, { KLx: 6000, KLy: 6000, Lb: 6000 }, 1)
  const bf = 20, tf = 1.3, tw = 0.8, hw = 37.4, d = 40, Af = bf * tf, Lb = 600
  const rT = Math.sqrt((tf * bf ** 3 / 12 + hw / 6 * tw ** 3 / 12) / (bf * tf + hw / 6 * tw)), Lr = Lb / rT
  const F67 = Lr <= Math.sqrt(35800 / Fy) ? (2 / 3 - Fy * Lr ** 2 / 107600) * Fy : 12000 / Lr ** 2
  near(b.Fbx, Math.min(0.6 * Fy, Math.max(F67, 840 / (Lb * d / Af))), 1e-12, `Lb 600 cm → max(7.2-6/7, 7.2-8) ≤ 0.6Fy (L/rT ${Lr.toFixed(1)})`)
  /* 8.2-1 손계산 */
  const f = { P: -400, Mx: 120, My: 0, V: 40 }, L = { KLx: 6000, KLy: 2000, Lb: 2000 }
  const r = asdCheck(sp, 235, 200000, L, 1, f, 0.85)
  const fa = 400 / 9.80665 / (sp.A / 100), fbx = 120 * 100 / 9.80665 / (sp.Sx / 1000)
  const Fa = asdFa(Fy, E, Math.max(6000 / sp.rx, 2000 / sp.ry)), Fex = 12 * Math.PI ** 2 * E / (23 * (6000 / sp.rx) ** 2)
  const e1 = fa / Fa + 0.85 * fbx / ((1 - fa / Fex) * 0.66 * Fy), e2 = fa / (0.6 * Fy) + fbx / (0.66 * Fy)
  ok(fa / Fa > 0.15, 'fa/Fa > 0.15 → 8.2-1/8.2-2')
  near(r.ratio, Math.max(e1, e2), 1e-12, '8.2-1 / 8.2-2 hand calc'); ok(r.eq === (e1 >= e2 ? 'ASD 8.2-1' : 'ASD 8.2-2'), 'governing equation label')
  const t = asdCheck(sp, 235, 200000, L, 1, { P: 100, Mx: 80, My: 5, V: 0 }, 0.85)
  near(t.ratio, (100 / 9.80665 / (sp.A / 100)) / (0.6 * Fy) + (80 * 100 / 9.80665 / (sp.Sx / 1000)) / (0.66 * Fy) + (5 * 100 / 9.80665 / (sp.Sy / 1000)) / (0.75 * Fy), 1e-12, '8.3-1 tension + bending')
}
/* 3. 圓管 7.4, Cb */
{
  const p = dimensionSectionProps('P 114.3x3.2')
  const a = asdAllowable(p, 235, 200000, { KLx: 3000, KLy: 3000, Lb: 3000 }, 1)
  ok(p.d / p.tw <= 145 / Fy && Math.abs(a.Fbx - 0.66 * Fy) < 1e-12, 'pipe D/t 35.7 ≤ 145/Fy → 0.66Fy (7.4-1)')
  ok(asdCb([10, 5, 0, -5, -10]) === 1.75 - 1.05 + 0.3 && asdCb([10, 2, 0, 1, 0]) === 1.75 && asdCb([5, 8, 3, 2, 5]) === 1, 'Cb single curvature assumption, 1 when interior ≥ M2')
}
/* 4. 2.2 조합 Gen 페이로드 — spec.asd 일 때만, 이름 ≤ 20자, 1/3 할증 없음 계수 */
{
  const base = structuredClone(DEFAULT_SPEC), on = { ...base, asd: true }
  const m = buildPortal(on), lp = buildLoadPayloads(on, m), off = buildLoadPayloads(base, buildPortal(base))
  const asd = Object.values(lp['LCOM-GEN'] as Record<string, any>).filter((c) => c.NAME.startsWith('ASD '))
  const nW = lp.info.wind.variants.length, nE = 4
  ok(asd.length === 1 + 2 * (nW + nE), `ASD combos ${asd.length} = 1 + 2(${nW} W + ${nE} E)`)
  ok(Object.keys(off.info.comboKind).every((k) => !k.startsWith('ASD')) && Object.keys(lp['LCOM-GEN']).length === Object.keys(off['LCOM-GEN']).length + asd.length, 'LRFD set unchanged; ASD only when enabled')
  ok(asd.every((c) => c.NAME.length <= 20 && lp.info.comboKind[c.NAME] === 'asd'), 'names ≤ 20 chars, kind asd')
  const c22 = asd.find((c) => c.NAME.startsWith('ASD 2.2-2 WX1'))!
  ok(c22.vCOMB.find((v: any) => v.LCNAME === 'D').FACTOR === 1 && c22.vCOMB.find((v: any) => v.LCNAME === 'LR').FACTOR === 0.75 && Math.abs(c22.vCOMB.find((v: any) => v.LCNAME === 'WX1').FACTOR - 0.9375) < 1e-12, 'D + 0.75(L + 1.25W)')
  const c25 = asd.find((c) => c.NAME === 'ASD 2.2-5 +EX')!
  ok(c25.vCOMB.find((v: any) => v.LCNAME === 'D').FACTOR === 0.7 && c25.vCOMB.find((v: any) => v.LCNAME === 'EX').FACTOR === 0.8 && c25.vCOMB.find((v: any) => v.LCNAME === 'ETX').FACTOR === 0.8, '0.7D ± 0.8E (with accidental torsion)')
  ok(ASD_COMBOS.length === 5, 'five ASD 2.2 combinations')
}
/* 5. 설계 병합 — 모든 부재에 asd, ratio = max(LRFD, ASD); 접합은 LRFD 조합만 */
{
  const spec = { ...defaultSpecFor('TW'), asd: true }
  const syn = krSynthetic(spec), d = runDesign(spec, syn.model, syn.loads.info, syn.results)
  ok(d.members.length > 0 && d.members.every((m) => m.asd && Number.isFinite(m.asd.ratio) && m.ratio >= m.asd.ratio - 1e-12), 'every member has ASD ratio ≤ governing ratio')
  ok(d.members.some((m) => m.eq.startsWith('ASD')) || d.members.every((m) => m.ratio >= m.asd!.ratio), 'ASD governs where larger')
  const base = runDesign(defaultSpecFor('TW'), krSynthetic(defaultSpecFor('TW')).model, krSynthetic(defaultSpecFor('TW')).loads.info, krSynthetic(defaultSpecFor('TW')).results)
  ok(base.members.every((m) => !m.asd), 'no ASD fields when disabled')
  const cs = runConnections(spec, syn.model, syn.loads.info, syn.results)
  ok(cs.every((c) => !c.combo.startsWith('ASD')), 'connections never use ASD combinations')
  ok(checkScope(spec).issues.some((i) => i.key === 'twAsd' && i.level === 'warn'), 'scope warning twAsd')
  const { defaultAdditions, defaultPlatform } = await import('../src/domain/additions')
  const withPlat = { ...spec, features: { crane: false, mezzanine: true, multiSpan: false, opening: false }, additions: { ...defaultAdditions(spec), platform: defaultPlatform(spec) } }
  ok(checkScope(withPlat).issues.some((i) => i.key === 'twAsdAdditions' && i.level === 'block'), 'ASD + additions blocked')
}
/* 6. 냉간성형 Ω */
{
  const c = { phiPnc: 153, phiPnt: 158.65, phiPno: 153, phiMnxBraced: 15.865, phiMnxLTB: 15.03, phiMny: 3.006, phiVn: 15.2, PEx: 180, PEy: 90, phiMnxt: 15.03, phiMnxo: 15.865 }
  const a = cfAsdScale(c)
  near(a.phiPnc, 153 / (0.85 * 1.8), 1e-12, 'Pa = Pn/Ωc'); near(a.phiMnxBraced, 15.865 / (0.95 * 1.67), 1e-12, 'Ma = Mn/Ωb'); near(a.phiVn, 15.2 / (0.95 * 1.6), 1e-12, 'Va = Vn/Ωv'); near(a.PEx, 100, 1e-12, 'PE/Ωc')
}
console.log(`TW ASD: ${n} checks passed`)
