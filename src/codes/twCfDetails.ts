/* 대만 冷軋型鋼 규범 — 남은 퍼린·거트 항목 (순수, N·mm·MPa). 원문: COde/TW/knowledge/cold-formed-steel-code (2026-10-20 대조)
   - 6.5 腹板皺曲 (6.5-1) Pn = C t² Fy sinθ (1 − CR√(R/t))(1 + CN√(N/t))(1 − Ch√(h/t)) — 표6.5-2(C)·6.5-3(Z) 支承鎖固·單翼·端點:
     C 4, CR 0.14, CN 0.35, Ch 0.02, φw 0.85 (Ωw 1.75), R/t ≤ 9. 단순보 퍼린 양 끝 = 端點 반력 (h/t ≤ 200, N/t ≤ 210, N/h ≤ 2 → N 상한)
     가정: 내부 굽힘 반경 R = t, N = 받침(지붕보·기둥) 플랜지 폭, θ = 90°. 클리트로 웨브에 볼트 접합하면 皺曲 대신 볼트 지압이 지배.
   - 6.7·10.6.1 — 인장 플랜지가 외장재에 관통 체결(through-fastened)되고 압축 플랜지가 자유인 경우(부압) Mn = R·Se·Fy, φ 0.90 (Ω 1.67),
     R = 0.4 단순 C · 0.5 단순 Z. 형상 조건 1·3·4·5·7 (춤 < 292 mm, 60 ≤ d/t ≤ 170, 2.8 ≤ d/b ≤ 4.5, 16 ≤ 플랜지 평판 폭/t ≤ 43, 경간 ≤ 10 m)만
     앱이 확인 — 외장재·나사 조건(8~14)은 가정 (scope 냉간 예비검토). 조건 밖이면 기존 횡비틀림(새그로드 간격) + 6.7 비틀림 미평가.
   - 11.3.3 볼트 지압 (11.3-9) Pn = C·mf·d·t·Fu, φ 0.60 (Ω 2.50), 표11.3-2 C, 표11.3-3 mf 0.75(와셔 없음 가정)
   - 11.3.4 볼트 전단 Pn = Ab·Fnv, 표11.3-4 A307 Grade A d < 12.7 mm Fnv 165 MPa φ 0.65 (Ω 2.4)
   - 새그로드 M12 인장: 鋼構造 LRFD 表10.3-2 나사 봉 φ 0.75 × 0.75 Fu Ab (SS400 Fu 400 가정) */
import type { CCDims } from './twColdFormed'

const RT = 1 // R/t 가정

export function webCrippling(g: CCDims, Fy: number, N: number) {
  const t = g.t, R = RT * t, h = g.H - 2 * (t + R)
  const Ncap = Math.min(N, 210 * t, 2 * h)
  const Pn = 4 * t * t * Fy * (1 - 0.14 * Math.sqrt(R / t)) * (1 + 0.35 * Math.sqrt(Ncap / t)) * (1 - 0.02 * Math.sqrt(h / t))
  return { Pn: Pn / 1e3, phi: 0.85, omega: 1.75, applicable: h / t <= 200, N: Ncap, h }
}

/** 10.6.1 R 계수 (단순보) — 형상 조건 밖이면 null */
export function rFactor(g: CCDims, kind: 'CC' | 'Z', spanMm: number): number | null {
  const flat = g.B - 2 * g.t
  const ok = g.H < 292 && g.H / g.t >= 60 && g.H / g.t <= 170 && g.H / g.B >= 2.8 && g.H / g.B <= 4.5 && flat / g.t >= 16 && flat / g.t <= 43 && spanMm <= 10000
  return ok ? (kind === 'Z' ? 0.5 : 0.4) : null
}

/** 11.3.3 지압 (kN) — d mm, t mm, Fu MPa, 와셔 없음 mf 0.75 */
export function boltBearing(d: number, t: number, Fu: number) {
  const dt = d / t, C = dt < 10 ? 3 : dt <= 22 ? 4 - 0.1 * dt : 1.8
  return { Pn: (C * 0.75 * d * t * Fu) / 1e3, phi: 0.6, omega: 2.5 }
}
/** 11.3.4 A307 Grade A 볼트 전단 (kN) */
export const boltShearA307 = (d: number) => ({ Pn: (Math.PI * d * d / 4) * (d < 12.7 ? 165 : 186) / 1e3, phi: 0.65, omega: 2.4 })
/** 새그로드 나사 봉 인장 (kN) — φ 0.75 × 0.75 Fu Ab */
export const sagRodTension = (d: number, Fu = 400) => ({ Pn: (0.75 * Fu * Math.PI * d * d / 4) / 1e3, phi: 0.75 })
