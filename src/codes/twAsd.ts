/* 대만 鋼構造建築物鋼結構設計技術規範 — 容許應力設計法(ASD) 부재 검토 (순수, 내부 tf·cm).
   원문: COde/TW/knowledge/steel-design-technical-code/ASD-0*.md (2026-10-19 대조)
   - 2.2 조합: D+L · D+0.75(L±1.25W) · D+0.75(L±0.8E) · 0.7D±1.25W · 0.7D±0.8E (E: αy = 1.0), 1/3 할증 없음
   - 4.5 표4.5-1 λp·λr (Fy tf/cm²) — 熱軋 I 翼板 17/√Fy·25/√Fy, 銲接 25/√(Fy/kc), 腹板 170/√Fy(1−3.74fa/Fy)·68/√Fy, 圓管 145/Fy·630/Fy(撓曲)·232/Fy(軸壓)
   - 5.2 Ft = 0.6Fy (총단면; 순단면 0.5Fu 는 접합 상세 — 범위 밖)
   - 6.3 Fa (6.3-1)/(6.3-2), Cc = √(2π²E/Fy) — 세장 요소는 Q (부록1 → LRFD 부록 1 Qs·Qa 공용, compressionQ)
   - 7.2 강축: 結實 + Lb ≤ Lc → 0.66Fy (7.2-1), 半結實 7.2-2/7.2-3, Lb > Lc → 압축연 max(7.2-6/7, 7.2-8) ≤ 0.6Fy, Cb = 1.75+1.05(M1/M2)+0.3(M1/M2)² ≤ 2.3
   - 7.3 약축: 結實 0.75Fy, 半結實 7.3-3 (열간) / 0.6Fy
   - 7.4 圓管: 結實 0.66Fy, 半結實 0.6Fy
   - 7.5 Fv = 0.4Fy (h/tw ≤ 100/√Fy, 전 춤 × tw) / Fy·Cv/2.89 (가새 없는 웨브 a/h → ∞, Kv 5.34, 순높이 × tw)
   - 8.2 압축+휨 (8.2-1)·(8.2-2), fa/Fa ≤ 0.15 → (8.2-3); F′e = 12π²E/23(KL/r)² (8.2-4); Cm 0.85(횡이동 골조)/1.0(양단 핀 + 횡하중)
   - 8.3 인장+휨 (8.3-1) */
import type { SectionProps } from '../domain/sections'
import { compressionQ } from './twSteel'

const KN_TF = 1 / 9.80665, MPA_TFCM2 = 1 / 98.0665

export interface AsdLengths { KLx: number; KLy: number; Lb: number }
export interface AsdForces { P: number; Mx: number; My: number; V: number }
export interface AsdAllow { Fa: number; Ft: number; Fbx: number; Fby: number; Fv: number; Fex: number; Fey: number; Q: number; KLr: number; compact: 'compact' | 'noncompact' | 'slender'; notes: string[] }
export interface AsdResult { ratio: number; eq: `ASD ${string}`; fa: number; fbx: number; fby: number; fv: number; allow: AsdAllow }

/** ASD 6.3 — Fa (tf/cm²) */
export function asdFa(Fy: number, E: number, KLr: number, Q = 1): number {
  const Cc = Math.sqrt((2 * Math.PI ** 2 * E) / (Q * Fy))
  if (KLr >= Cc) return (12 * Math.PI ** 2 * E) / (23 * KLr ** 2)
  const r = KLr / Cc
  return ((1 - r ** 2 / 2) * Q * Fy) / (5 / 3 + (3 / 8) * r - r ** 3 / 8)
}

/** ASD 7.2.3 Cb — 구간 안 모멘트가 끝 모멘트 M2 이상이면 1. 곡률 방향은 부재력 부호 규약에 의존하므로
    항상 단일 곡률(M1/M2 = −ρ)로 둔다 → Cb = 1.75 − 1.05ρ + 0.3ρ² (복곡률 이득 무시, 보수적) */
export function asdCb(moments: number[]): number {
  const a = moments[0], b = moments[moments.length - 1]
  const M2 = Math.max(Math.abs(a), Math.abs(b)), M1 = Math.min(Math.abs(a), Math.abs(b))
  if (M2 < 1e-9 || moments.slice(1, -1).some((m) => Math.abs(m) >= M2 - 1e-9)) return 1
  const rho = M1 / M2
  return Math.min(2.3, 1.75 - 1.05 * rho + 0.3 * rho * rho)
}

/** 허용 응력 (tf/cm²) — sp mm, Fy·E MPa, 길이 mm */
export function asdAllowable(sp: SectionProps, FyMPa: number, EMPa: number, L: AsdLengths, Cb: number, fa = 0): AsdAllow {
  const Fy = FyMPa * MPA_TFCM2, E = EMPa * MPA_TFCM2, sF = Math.sqrt(Fy)
  const notes: string[] = []
  const KLr = Math.max(L.KLx / sp.rx, L.KLy / sp.ry)
  const q = compressionQ(sp, FyMPa * MPA_TFCM2, EMPa * MPA_TFCM2, KLr)
  const Q = q.Qs * q.Qa
  if (Q < 1) notes.push('ASD App.1 Q')
  const Fa = asdFa(Fy, E, KLr, Q)
  const Fex = (12 * Math.PI ** 2 * E) / (23 * (L.KLx / sp.rx) ** 2), Fey = (12 * Math.PI ** 2 * E) / (23 * (L.KLy / sp.ry) ** 2)
  let Fbx: number, Fby: number, Fv: number, compact: AsdAllow['compact']
  if (sp.kind === 'P') {
    const Dt = sp.d / sp.tw
    compact = Dt <= 145 / Fy ? 'compact' : Dt <= 630 / Fy ? 'noncompact' : 'slender'
    Fbx = Fby = compact === 'compact' ? 0.66 * Fy : 0.6 * Fy
    if (compact === 'slender') notes.push('ASD 4.5 slender pipe')
    Fv = 0.4 * Fy
  } else {
    const bt = sp.bf / (2 * sp.tf), ht = sp.h / sp.tw
    const kc = ht > 70 ? 4.05 / ht ** 0.46 : 1
    const flR = sp.rolled ? 25 / sF : 25 / Math.sqrt(Fy / kc)
    const fRatio = fa / Fy
    const webP = fRatio <= 0.16 ? (170 / sF) * (1 - 3.74 * fRatio) : 68 / sF
    const flangeCompact = bt <= 17 / sF, flangeOK = bt <= flR, webCompact = ht <= webP, webOK = ht <= 260 / sF
    compact = flangeCompact && webCompact ? 'compact' : flangeOK && webOK ? 'noncompact' : 'slender'
    if (compact === 'slender') notes.push('ASD 4.5 slender element')
    /* 7.2 강축 */
    const Af = (sp.bf * sp.tf) / 100 // cm²
    const d = sp.d / 10, bf = sp.bf / 10, Lb = L.Lb / 10
    const Lc = Math.min((20 * bf) / sF, 1400 / ((d / Af) * Fy))
    if (Lb <= Lc && compact !== 'slender') {
      Fbx = flangeCompact && webCompact ? 0.66 * Fy
        : sp.rolled ? Fy * (0.79 - 0.0075 * bt * sF) : Fy * (0.79 - 0.0075 * bt * Math.sqrt(Fy / kc))
      Fbx = Math.min(0.66 * Fy, Math.max(0.6 * Fy, Fbx))
    } else {
      /* r_T: 압축 플랜지 + 압축 웨브 1/3 (웨브 h/6) — 웨브 축 회전반경 */
      const tf = sp.tf / 10, tw = sp.tw / 10, hw = sp.h / 10
      const rT = Math.sqrt(((tf * bf ** 3) / 12 + ((hw / 6) * tw ** 3) / 12) / (bf * tf + (hw / 6) * tw))
      const Lr = Lb / rT
      const lo = Math.sqrt((7160 * Cb) / Fy), hi = Math.sqrt((35800 * Cb) / Fy)
      const F67 = Lr < lo ? 0.6 * Fy : Lr <= hi ? (2 / 3 - (Fy * Lr ** 2) / (107600 * Cb)) * Fy : (12000 * Cb) / Lr ** 2
      const F8 = (840 * Cb) / ((Lb * d) / Af)
      Fbx = Math.min(0.6 * Fy, Math.max(F67, F8))
      if (Fbx < 0.6 * Fy - 1e-9) notes.push('ASD 7.2.3 LTB')
    }
    /* 7.3 약축 */
    Fby = flangeCompact ? 0.75 * Fy : flangeOK && sp.rolled ? Math.min(0.75 * Fy, Fy * (1.075 - 0.019 * bt * sF)) : 0.6 * Fy
    /* 7.5 전단 — 가새 없는 웨브 Kv 5.34 */
    if (ht <= 100 / sF) Fv = 0.4 * Fy
    else {
      const Kv = 5.34
      let Cv = (3100 * Kv) / (Fy * ht ** 2)
      if (Cv > 0.8) Cv = (50 * Math.sqrt(Kv / Fy)) / ht
      Fv = Math.min(0.4 * Fy, (Fy / 2.89) * Cv)
    }
  }
  return { Fa, Ft: 0.6 * Fy, Fbx, Fby, Fv, Fex, Fey, Q, KLr, compact, notes }
}

/** 조합 응력비 — forces: P kN(+ 인장), Mx·My kN·m(절댓값), V kN. Cm: 0.85(골조 기둥·지붕보) / 1.0(횡하중 받는 양단 핀 부재) */
export function asdCheck(sp: SectionProps, FyMPa: number, EMPa: number, L: AsdLengths, Cb: number, f: AsdForces, Cm: number): AsdResult {
  const A = sp.A / 100, Sx = sp.Sx / 1000, Sy = sp.Sy / 1000 // cm², cm³
  const fa = (Math.abs(f.P) * KN_TF) / A
  const fbx = (f.Mx * 100 * KN_TF) / Sx, fby = (f.My * 100 * KN_TF) / Sy
  const Aw = sp.kind === 'P' ? A / 2 : ((sp.h / sp.tw <= 100 / Math.sqrt(FyMPa * MPA_TFCM2) ? sp.d : sp.h) * sp.tw) / 100
  const fv = (f.V * KN_TF) / Aw
  const allow = asdAllowable(sp, FyMPa, EMPa, L, Cb, f.P < 0 ? fa : 0)
  const Fy = FyMPa * MPA_TFCM2
  let pm: number, eq: AsdResult['eq']
  if (f.P >= 0) { pm = fa / allow.Ft + fbx / allow.Fbx + fby / allow.Fby; eq = 'ASD 8.3-1' }
  else if (fa / allow.Fa <= 0.15) { pm = fa / allow.Fa + fbx / allow.Fbx + fby / allow.Fby; eq = 'ASD 8.2-3' }
  else {
    const a = fa / allow.Fa + (Cm * fbx) / (Math.max(1e-3, 1 - fa / allow.Fex) * allow.Fbx) + (Cm * fby) / (Math.max(1e-3, 1 - fa / allow.Fey) * allow.Fby)
    const b = fa / (0.6 * Fy) + fbx / allow.Fbx + fby / allow.Fby
    pm = Math.max(a, b); eq = a >= b ? 'ASD 8.2-1' : 'ASD 8.2-2'
  }
  const sv = fv / allow.Fv
  return sv > pm ? { ratio: sv, eq: 'ASD 7.5', fa, fbx, fby, fv, allow } : { ratio: pm, eq, fa, fbx, fby, fv, allow }
}

/** ASD 2.2 조합 (원문 계수) — 하중 종류별 계수 [D, L, W, E] */
export const ASD_COMBOS: { ref: string; terms: [string, number][] }[] = [
  { ref: '2.2-1', terms: [['D', 1], ['L', 1]] },
  { ref: '2.2-2', terms: [['D', 1], ['L', 0.75], ['W', 0.9375]] },
  { ref: '2.2-3', terms: [['D', 1], ['L', 0.75], ['E', 0.6]] },
  { ref: '2.2-4', terms: [['D', 0.7], ['W', 1.25]] },
  { ref: '2.2-5', terms: [['D', 0.7], ['E', 0.8]] },
]

/** 냉간성형 (冷軋型鋼 1.3.1 ASD) — LRFD 설계강도를 φ·Ω 로 나눠 허용강도로: 압축 0.85·1.80, 휨 0.95·1.67, 인장 0.95·1.67, 전단 0.95·1.60.
    휨 단면형상변형(φ 0.90)도 0.95·1.67 로 나눠 보수적. 증폭 α 의 P_E 는 Ωc 로 나눔 (AISI C5.2.1 ASD). */
export function cfAsdScale<T extends { phiPnc: number; phiPnt: number; phiPno: number; phiMnxBraced: number; phiMnxLTB: number; phiMny: number; phiVn: number; PEx: number; PEy: number; phiMnxt: number; phiMnxo: number }>(c: T): T {
  const b = 0.95 * 1.67, cpr = 0.85 * 1.80
  return { ...c, phiPnc: c.phiPnc / cpr, phiPno: c.phiPno / cpr, phiPnt: c.phiPnt / b, phiMnxBraced: c.phiMnxBraced / b, phiMnxLTB: c.phiMnxLTB / b,
    phiMny: c.phiMny / (0.9 * 1.67), phiVn: c.phiVn / (0.95 * 1.60), PEx: c.PEx / 1.80, PEy: c.PEy / 1.80, phiMnxt: c.phiMnxt / (0.9 * 1.67), phiMnxo: c.phiMnxo / b }
}
