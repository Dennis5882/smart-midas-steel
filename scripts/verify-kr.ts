/* 한국 KDS 오프라인 회귀 (Gen·키 불필요) — node --import tsx scripts/verify-kr.ts
   ① 원문 표·식 고정점(재료 표 3.3-1, 지붕활하중 3.6.1, Fa·Fv·S_DS·S_D1, 내진설계범주, Cs, K_zr·G_D, 외압계수, 적설)
   ② KDS 14 31 10 부재 강도 — 별도 손계산(파이썬 독립 구현, 2026-10-16) 값과 대조
   ③ 하중 평형: L_r·적설·불균형 적설 합 = 손계산, 지진 = Cs·W, 가상하중 = 0.002·W, 풍직각 = γ·W_D, 조합 수
   ④ 적용범위·입력 칸·Gen 페이로드(KS22(S)·KS21·KDS 41 30) ⑤ 합성 결과로 설계 검토 전체 경로 */
import './_dom-stub'
import assert from 'node:assert/strict'
import { fyKR, KR, KR_GEN_DESIGN_CODE, roofLiveKR } from '../src/codes/kr'
import { areaKa, csKR, flatRoofCpeKR, flatSnowKR, gustKR, kzrKR, leewardRoofCpeKR, periodKR, sdcKR, slopeCsKR, spectrumKR, windwardRoofCpeKR } from '../src/codes/krLateral'
import { krCapacity, krCheck, krKSway } from '../src/codes/krSteel'
import { defaultSpecFor, KR_DEFAULT_SPEC, normalizeSpans, type FactorySpec } from '../src/domain/types'
import { buildPortal } from '../src/domain/portal'
import { buildLoadPayloads } from '../src/domain/loads'
import { buildGenPayloads } from '../src/domain/gen'
import { sectionProps } from '../src/domain/sections'
import { checkScope } from '../src/domain/scope'
import { KR_CATALOG } from '../src/domain/krCatalog'
import { runDesign } from '../src/domain/design'
import { runConnections } from '../src/domain/connections'
import { groupsFor, initVals, invalidFields, toSpec } from '../src/components/planFields'
import { krSynthetic } from './kr-synth'
import { cpeCCKR, cpiCCKR, zoneWidthKR } from '../src/codes/krWindCC'
import { CPI_KEYS, CPI_KR } from '../src/codes/krLateral'
import { krCCLoads, ccVelocityKR } from '../src/domain/krSecondary'
import { portalGeometry } from '../src/domain/portal'

let n = 0
const near = (a: number, b: number, tol = 1e-6, msg = '') => { n++; assert.ok(Math.abs(a - b) <= tol, `${msg} ${a} != ${b}`) }
const ok = (c: boolean, msg: string) => { n++; assert.ok(c, msg) }

/* ① 표·식 고정점 */
near(fyKR('SS275', 16), 275); near(fyKR('SS275', 17), 265); near(fyKR('SM355', 40), 345); near(fyKR('SM355', 41), 335); near(fyKR('SN275', 40), 275)
assert.throws(() => fyKR('SS275', 101)); assert.throws(() => fyKR('SS400', 10))
near(roofLiveKR(0.1, 9), 1.0); near(roofLiveKR(0.5, 40), 0.72, 1e-9, 'R1 0.8 × R2 0.9'); near(roofLiveKR(1, 100), 0.6, 1e-9, 'lower bound')
const sp = spectrumKR(0.22, 'S4')
near(sp.Fa, 1.36, 1e-9); near(sp.Fv, 1.96, 1e-9); near(sp.SDS, 0.22 * 2.5 * 1.36 * 2 / 3, 1e-12); near(sp.SD1, 0.22 * 1.96 * 2 / 3, 1e-12)
near(spectrumKR(0.1, 'S1').Fa, 1.12); near(spectrumKR(0.3, 'S5').Fv, 2.4)
ok(sdcKR(sp.SDS, sp.SD1, '2') === 'D', 'S4 zone I → SDC D'); ok(sdcKR(0.3, 0.1, '2') === 'B', 'B'); ok(sdcKR(0.3, 0.1, 'S') === 'C', 'special C')
near(periodKR('moment', 10), 0.0724 * 10 ** 0.8, 1e-12); near(periodKR('braced', 10), 0.0488 * 10 ** 0.75, 1e-12)
const cs = csKR(0.4, sp, 3, 1)
near(cs.c, sp.SDS / 3, 1e-12); near(csKR(4, sp, 3, 1).c, sp.SD1 / 12, 1e-12, '7.2-3 governs'); near(csKR(4, { SDS: 0.05, SD1: 0.02, TL: 5 }, 8, 1).c, 0.01, 1e-12, '7.2-5 floor')
near(kzrKR(8, 'C'), 1.0); near(kzrKR(30, 'B'), 0.45 * 30 ** 0.22, 1e-12)
near(gustKR(8.6, 36, 'C'), 2.080212, 1e-5, 'G_D hand calc (I_H 0.20362, γ_D 0.32673, B_D 0.68314)')
ok(JSON.stringify(windwardRoofCpeKR(20, 0.5)) === JSON.stringify([-0.4, 0.0]), 'windward table 20°, H/D 0.5')
near(leewardRoofCpeKR(25, 0.25, 5), -0.72, 1e-12, '−0.06(7+B/D)'); near(leewardRoofCpeKR(10, 1, 1), -0.7)
ok(flatRoofCpeKR(1, 8, 0.3)[0] === -0.9 && flatRoofCpeKR(30, 8, 0.3)[1] === 0.2, 'flat roof zones'); near(areaKa(25), 0.9); near(areaKa(55), 0.9 - 0.1 * 30 / 75, 1e-12)
near(flatSnowKR({ Sg: 0.5, Ce: 1, Ct: 1, Is: 1, thetaDeg: 5 }).Sf, 1.0, 1e-12, '4.3.5 min 1.0'); near(flatSnowKR({ Sg: 3, Ce: 1, Ct: 1, Is: 1, thetaDeg: 30 }).Sf, 2.1, 1e-12)
near(slopeCsKR(50, 1), 0.5); near(slopeCsKR(50, 1.2), 0.8)
near(krKSway(1, 10), 1.9, 0.15, 'alignment chart (fixed base, pinned-ish top)')

/* ② 부재 강도 — 독립 손계산 */
const pipe = krCapacity(sectionProps('P 139.8x4.5'), 275, { KLx: 3000, KLy: 3000, Lb: 3000 }, 1)
near(pipe.phiPnc, 380.610, 0.01, 'pipe φPn'); near(pipe.phiMnx, 20.396, 0.001, 'pipe φMp')
const H = sectionProps('H 600x200x11/17')
for (const [Lb, m] of [[1500, 682.868], [4000, 558.967], [12000, 163.635]] as const)
  near(krCapacity(H, 265, { KLx: 10000, KLy: 1500, Lb }, 1).phiMnx, m, 0.01, `H600 φMn Lb ${Lb}`)
const hc = krCapacity(H, 265, { KLx: 10000, KLy: 1500, Lb: 1500 }, 1)
near(hc.phiVn, 1049.4, 0.01, 'rolled H φv 1.0'); near(hc.phiPnc, 2683.68, 0.05, 'slender web effective width'); near(hc.aeRatio, 0.94866, 1e-4)
const r1 = krCheck(hc, { P: -0.3 * hc.phiPnc, Mx: 0.3 * hc.phiMnx, My: 0, V: 0 })
near(r1.ratio, 0.3 + 8 / 9 * 0.3, 1e-12); ok(r1.eq === 'KDS 4.4-1', '4.4-1')
near(krCheck(hc, { P: -0.1 * hc.phiPnc, Mx: 0.5 * hc.phiMnx, My: 0, V: 0 }).ratio, 0.55, 1e-12, '4.4-2')
ok(sectionProps('LH 150x75x3.2/4.5').rolled === false && sectionProps('H 150x150x7/10').rolled, 'LH welded / H rolled')
for (const [role, list] of Object.entries(KR_CATALOG)) for (const s of list) { const p = sectionProps(s); ok(p.A > 0 && Number.isFinite(krCapacity(p, 275, { KLx: 3000, KLy: 1500, Lb: 1500 }, 1).phiPnc), `${role} ${s}`) }

/* ③ 하중 */
const sum = (spec: FactorySpec) => {
  const m = buildPortal(spec), l = buildLoadPayloads(spec, m)
  const s: Record<string, number[]> = {}
  for (const [id, v] of Object.entries<any>(l.BMLD)) for (const it of v.ITEMS) {
    const e = m.elements[+id - 1], a = m.nodes[e.n1 - 1], b = m.nodes[e.n2 - 1]
    const L = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z), t = s[it.LCNAME] ??= [0, 0, 0]
    t[{ GX: 0, GY: 1, GZ: 2 }[it.DIRECTION as 'GX']] += it.P[0] * L
  }
  for (const v of Object.values<any>(l.CNLD)) for (const it of v.ITEMS) { const t = s[it.LCNAME] ??= [0, 0, 0]; t[0] += it.FX; t[1] += it.FY }
  return { m, l, s }
}
const g = sum(defaultSpecFor('KR'))
ok(Object.keys(g.l.STLD).length === 23 && Object.keys(g.l['LCOM-GEN']).length === 54, `gable cases/combos ${Object.keys(g.l.STLD).length}/${Object.keys(g.l['LCOM-GEN']).length}`)
near(g.s.LR[2], -1.0 * 24 * 36, 1e-6, 'LR = 1.0 × 24 × 36'); near(g.s.SN[2], -1.0 * 24 * 36, 1e-6, 'snow min 1.0 × B × L')
const W = g.l.info.seismic.W
near(g.s.EX[0], sp.SDS / 3 * W, 1e-6, 'V = Cs·W'); near(g.s.EY[1], sp.SDS / 3 * W, 1e-6)
near(g.s.ETX[1], 0, 1e-9, 'torsion couple'); near(g.s.NXD[0], 0.002 * W, 1e-6, 'notional 0.002·W (dead + self weight)')
near(g.s.NXL[0], 0.002 * 864, 1e-6)
near(g.l.info.wind.qh, 0.5 * 1.225 * (28 * 0.95) ** 2 / 1000, 1e-12, 'q_H')
near(g.l.info.wind.across.WLX, Math.max(0.35 * 24 / 36, 0.2) * g.l.info.wind.across.WDx, 1e-9, 'W_LC = γ·W_D')
ok(g.l.info.kr!.sdc === 'D' && g.l.info.kr!.orth30, 'SDC D → 100% + 30%')
ok(Object.values<any>(g.l['LCOM-GEN']).filter((c) => /1\.7-[57]/.test(c.NAME)).length === 8, 'symmetric: 2 seismic variants per direction × 2 directions × 2 combos')
const steep = sum({ ...defaultSpecFor('KR'), roofSlope: 0.5 }) // 26.6° → 불균형
ok(['SN1', 'SN2'].every((c) => c in steep.s), 'unbalanced snow cases for θ > 15°')
const Ss = steep.l.info.snow!
near(steep.s.SN1[2], -(1.5 * Ss / 1.0) * 12 * 36, 1e-6, 'SN1 = 1.5S_s/Ce on leeward half')
const multi = sum({ ...defaultSpecFor('KR'), frame: 'multi', spanList: [24, 24], span: 48 })
near(multi.s.SNU[2], -36 * (2 * 12 * 0.5 + 2 * 12 * (0.5 + 2) / 2), 1e-6, 'multi unbalanced: eave halves 0.5S_f, valley halves 0.5 → 2S_f/Ce')
const mono = sum({ ...defaultSpecFor('KR'), frame: 'mono' })
ok(['WX5', 'WX8'].every((c) => c in mono.s), 'mono wind from both sides')
const asym = sum({ ...defaultSpecFor('KR'), bayList: [6, 6, 7.5, 6, 6, 6] })
ok(['WY5', 'WY8'].every((c) => c in asym.s), 'asymmetric bays → Y wind from both gables')

/* ④ 적용범위·입력·Gen */
const sc = checkScope(defaultSpecFor('KR'))
ok(!sc.blocked && sc.issues.some((i) => i.key === 'krPhase'), 'KR sample in scope with phase warning')
ok(checkScope({ ...defaultSpecFor('KR'), korea: { ...KR_DEFAULT_SPEC.korea!, V0: 10 } }).issues.some((i) => i.key === 'kr' && i.level === 'block'), 'V0 out of range blocked')
ok(checkScope({ ...defaultSpecFor('KR'), frame: 'multi', spanList: [24, 24], span: 48 }).issues.some((i) => i.key === 'multiKR'), 'multiKR warn')
const fields = groupsFor('KR').flatMap((x) => x.fields).map((f) => f.path)
ok(fields.includes('korea.V0') && fields.includes('korea.site') && !fields.includes('seismic.SDS') && !fields.includes('fc'), 'KR field groups')
const vals = initVals(defaultSpecFor('KR'))
ok(invalidFields(defaultSpecFor('KR'), vals, false).length === 0, 'KR defaults valid')
ok(invalidFields(defaultSpecFor('KR'), { ...vals, 'korea.KD': '0.5' }, false).some((f) => f.path === 'korea.KD'), 'K_D below 0.85 invalid')
ok(toSpec(defaultSpecFor('KR'), { ...vals, 'korea.Ct': '1.2', 'korea.site': 'S2' }, false).korea!.Ct === 1.2, 'toSpec numeric select')
const gp = buildGenPayloads(defaultSpecFor('KR'), g.m) as any
ok(gp.MATL[1].PARAM[0].STANDARD === 'KS22(S)' && gp.MATL[1].PARAM[0].DB === 'SS275' && gp.MATL[2], 'KS22(S) materials, secondary MATL 2')
const sect = Object.values<any>(gp.SECT)
ok(sect.every((x) => x.SECT_BEFORE.SECT_I.DB_NAME === 'KS21') && sect.some((x) => x.SECT_BEFORE.SECT_I.SECT_NAME.startsWith('LH') && x.SECT_BEFORE.SHAPE === 'H'), 'KS21 sections, LH → SHAPE H')
ok(Object.values<any>(g.l['LCOM-GEN']).every((c) => c.NAME.length <= 20), 'combination names ≤ 20 chars (Gen limit)')
for (const v of [{}, { frame: 'mono' as const }, { frame: 'multi' as const, spanList: [24, 30] }]) { const s = normalizeSpans({ ...defaultSpecFor('KR'), ...v }), l = buildLoadPayloads(s, buildPortal(s)) as any; ok(Object.values<any>(l.CNLD).every((r) => new Set(r.ITEMS.map((i: any) => i.LCNAME)).size === r.ITEMS.length), `one CNLD item per case per node (${s.frame ?? 'gable'})`) }
ok(Object.keys(g.l.BMLD).every((id) => gp.ELEM[id].TYPE !== 'TRUSS'), 'no beam loads on TRUSS elements (Gen rejects — live 2026-10-16)')
ok(KR.gen.designCode === undefined && KR_GEN_DESIGN_CODE === 'KDS 41 30 : 2022' && !('DSTL' in gp), 'no db/DSTL for KR (DESIGN/STEEL/DSTL only in live cross-check)')

/* ⑤ 합성 결과로 설계 검토 경로 — 모든 조합에 같은 비례 부재력(기둥 압축 + 휨), 변위는 작은 값 */
const spec = defaultSpecFor('KR'), info = g.l.info
const { results: res } = krSynthetic(spec)
const d = runDesign(spec, g.m, info, res)
ok(d.members.length === g.m.elements.length && d.members.every((m) => Number.isFinite(m.ratio) && m.ratio > 0), 'every member checked')
ok(d.service.length === 6 && d.service.find((s) => s.key === 'seisDriftX')!.limit === 0.02, 'service checks incl. KDS drift limit')
const col = d.byRole.column!
ok(col.B >= 1 && /KDS|KL/.test(col.eq), `column eq ${col.eq}`)
near(d.service.find((s) => s.key === 'seisDriftX')!.value, 3 * Math.abs(0.004 + 0.004) / 8, 1e-9, 'δ = Cd·(E+ET)/I_E / h') // dx(EX) + dx(ETX)
near(d.service.find((s) => s.key === 'windDriftX')!.value, 0.65 * Math.abs(0.004 + 0.004) / 8, 1e-9, '0.65·(W + W_L)')
ok(runConnections(spec, g.m, info, res).length === 0, 'connections phase 2 → none')

/* ⑥ 외장재설계용 풍하중 (KDS 41 12 00 5.4.2·5.8) — 그래프 고정점 + 샘플 손계산 */
for (const k of CPI_KEYS) ok(cpiCCKR(k)[0] === 2 * CPI_KR[k][0] && cpiCCKR(k)[1] === 2 * CPI_KR[k][1], `table 5.8-9 = 2 × table 5.7-4 (${k})`)
near(cpeCCKR('gable', 3, 1, 5).neg, -6.0); near(cpeCCKR('gable', 3, 10, 5).neg, -2.25); near(cpeCCKR('gable', 2, 0.5, 5).neg, -3.9)
near(cpeCCKR('gable', 1, 50, 20).neg, -1.6); near(cpeCCKR('gable', 3, 1, 35).pos, 1.95); near(cpeCCKR('gable', 1, 1, 5).pos, 0, 0, 'θ ≤ 10° roof: no positive graph')
near(cpeCCKR('mono', 3, 1, 5).neg, -5.2); near(cpeCCKR('mono', 3, 10, 20).neg, -4.0); near(cpeCCKR('multi', 2, 1, 20).neg, -4.4); near(cpeCCKR('multi', 1, 1, 5).neg, -2.1, 1e-12, 'multi θ ≤ 10° = table 5.8-2② ①')
near(cpeCCKR('gable', 4, 2, 20).pos, 2.0, 1e-12, 'wall + flat to 2 m²'); near(cpeCCKR('gable', 5, 50, 20).neg, -1.6); near(cpeCCKR('gable', 4, 1, 5).neg, -2.2 * 0.9, 1e-12, 'θ ≤ 10° wall −10%')
assert.throws(() => cpeCCKR('mono', 1, 5, 35), /5\.8/); n++
near(zoneWidthKR(8.6, 24), 2.4); near(zoneWidthKR(3, 60), 2.4, 1e-12, '0.04 × 60 governs'); near(zoneWidthKR(2, 10), 1.0, 1e-12, '1 m floor')
{
  const sp0 = defaultSpecFor('KR'), G0 = portalGeometry(sp0), q = ccVelocityKR(sp0, info), cc = krCCLoads(sp0, g.m, info)
  near(q, info.wind.qh, 1e-12, 'exposure C sample: C&C q_H = MWFRS q_H')
  const lg = Math.log10
  const Ap = 6 * G0.sRoof, Ag = 6 * G0.gWall
  const pur = [...cc.entries()].filter(([id]) => g.m.elements[id - 1].role === 'purlin'), gir = [...cc.entries()].filter(([id]) => g.m.elements[id - 1].role === 'girt')
  const z3 = pur.find(([, c]) => c.zone === 3)![1], z1 = pur.find(([, c]) => c.zone === 1)
  near(z3.A, Ap, 1e-9, 'A_C = bay × purlin spacing')
  near(z3.pNeg, q * (-6 + 3.75 * lg(Ap)), 1e-9, 'purlin corner p− = q_H·Cpe③ (Cpi+ 0, wallsLeaky)')
  near(z3.pPos, 0.675, 1e-12, 'purlin p+ = q·0.8 < 675 N/m² → floor')
  const g4 = gir.find(([, c]) => c.zone === 4)![1]
  near(g4.pPos, q * (0.9 * (2.0 - 0.6 * lg(Ag / 2) / lg(25)) + 0.8), 1e-9, 'girt p+ = q(0.9·Cpe④⑤ − Cpi−)')
  near(g4.pNeg, q * 0.9 * (-2.2 + 0.6 * lg(Ag) / lg(50)), 1e-9, 'girt p− = q·0.9·Cpe④')
  const [id1, c1] = z1!, e1 = g.m.elements[id1 - 1], wD = (sp0.roofDead * G0.sRoof + 77 * sectionProps(e1.section).A * 1e-6) * Math.cos(G0.theta)
  near(c1.demands.find((x) => x.combo.endsWith('1.7-6'))!.f.Mx, Math.abs(0.9 * wD + c1.pNeg * G0.sRoof) * 36 / 8, 1e-9, '1.7-6 Mx = |0.9D + W−|·L²/8')
  ok(pur.every(([, c]) => c.demands.length === 3) && gir.every(([, c]) => c.demands.length === 2), 'purlin 1.7-3/4/6, girt 1.7-4/6')
  ok(d.cc?.length === 5 && d.cc.reduce((t, c) => t + c.count, 0) === pur.length + gir.length, 'design C&C summary: 3 roof + 2 wall zones, every purlin/girt')
  /* 설계 반영 — 외장재 요구 강도비 ≤ 부재 강도비 */
  const m1 = d.members.find((m) => m.id === id1)!, sp1 = sectionProps(e1.section), Fy1 = fyKR(sp0.secondaryMaterial ?? sp0.material, Math.max(sp1.tf, sp1.tw))
  const ccR = Math.max(...c1.demands.map((x) => krCheck(krCapacity(sp1, Fy1, x.braced ? { ...m1.lengths, Lb: 1 } : m1.lengths, 1), x.f, 1).ratio))
  ok(m1.ratio >= ccR - 1e-12, `purlin ratio ${m1.ratio.toFixed(3)} ≥ C&C ${ccR.toFixed(3)}`)
  /* 하한 — 낮은 풍속에서 모든 |p| ≥ 0.675 */
  const low = { ...sp0, korea: { ...sp0.korea!, V0: 20 } }, ml = buildPortal(low)
  ok([...krCCLoads(low, ml, buildLoadPayloads(low, ml).info).values()].every((c) => c.pPos >= 0.675 && c.pNeg <= -0.675), '|W_C/A_C| ≥ 675 N/m² (5.4(2))')
  /* 큰 개구부(탁월 개구부 2) 에서 외장재 하중이 지배 */
  const open = { ...sp0, korea: { ...sp0.korea!, cpi: 'dominant2' as const, V0: 40 } }, mo = buildPortal(open), io = buildLoadPayloads(open, mo).info
  const dOpen = runDesign(open, mo, io, krSynthetic(open).results)
  ok(/^C&C/.test(dOpen.byRole.purlin!.combo) || /^C&C/.test(dOpen.byRole.girt!.combo), `C&C governs with dominant opening (purlin ${dOpen.byRole.purlin!.combo}, girt ${dOpen.byRole.girt!.combo})`)
  /* 적용범위 — 표 5.8-1(H ≥ 20 m)·편지붕 30° 초과는 막음 */
  ok(checkScope({ ...sp0, frame: 'mono', roofSlope: 0.7 }).blocked, 'mono > 30° blocked (table 5.8-3)')
  ok(checkScope({ ...sp0, eaveHeight: 18, span: 60, roofSlope: 0.3 }).blocked, 'H ≥ 20 m blocked (table 5.8-1 not implemented)')
}
console.log(`KR passed: ${n} checks (KDS tables, KDS 14 31 10 hand calc, loads equilibrium, scope/input/Gen, synthetic design, cladding wind)`)
