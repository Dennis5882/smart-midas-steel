/* 단면 성질 (순수 함수, mm 단위) — CNS2020 단면명의 치수로 계산.
   H형강: 필렛 무시(면적·강성 1~2% 작게, 보수적). 립 C형강(CC): 중심선 근사 + 무립 C형 Cw 근사(냉간성형 유효폭 미고려).
   강관(P): 정확식. */

export type ShapeKind = 'H' | 'CC' | 'P'

export interface SectionProps {
  name: string
  kind: ShapeKind
  /** 압연(RH) 여부 — 잔류응력 Fr 구분 (압연 0.7, 용접 1.16 tf/cm²) */
  rolled: boolean
  /** 춤·폭·두께 (mm) */
  d: number
  bf: number
  tw: number
  tf: number
  /** 웨브 순높이 h (mm) */
  h: number
  A: number
  /** 강축(x)·약축(y) */
  Ix: number
  Iy: number
  Sx: number
  Sy: number
  Zx: number
  Zy: number
  rx: number
  ry: number
  J: number
  Cw: number
}

const num = (s: string) => s.split('x').map(Number)

export function sectionProps(name: string): SectionProps {
  const [kind, dims] = name.trim().split(/\s+/)
  if (kind === 'RH' || kind === 'BH') {
    const [H, B, tw, tf] = num(dims)
    const hw = H - 2 * tf
    const A = 2 * B * tf + hw * tw
    const Ix = (B * H ** 3 - (B - tw) * hw ** 3) / 12
    const Iy = (2 * tf * B ** 3 + hw * tw ** 3) / 12
    return {
      name, kind: 'H', rolled: kind === 'RH', d: H, bf: B, tw, tf, h: hw, A, Ix, Iy,
      Sx: (2 * Ix) / H, Sy: (2 * Iy) / B,
      Zx: B * tf * (H - tf) + (tw * hw ** 2) / 4, Zy: (tf * B ** 2) / 2 + (hw * tw ** 2) / 4,
      rx: Math.sqrt(Ix / A), ry: Math.sqrt(Iy / A),
      J: (2 * B * tf ** 3 + hw * tw ** 3) / 3, Cw: (Iy * (H - tf) ** 2) / 4,
    }
  }
  if (kind === 'CC') {
    const [size, ts] = dims.split('/')
    const [H, B, c] = num(size)
    const t = +ts
    const h = H - t, b = B - t, cl = c - t / 2 // 중심선 치수
    const A = t * (h + 2 * b + 2 * cl)
    const Ix = (t * h ** 3) / 12 + 2 * b * t * (h / 2) ** 2 + 2 * ((t * cl ** 3) / 12 + cl * t * (h / 2 - cl / 2) ** 2)
    const xb = (2 * b * t * (b / 2) + 2 * cl * t * b) / A // 웨브 중심선에서 도심까지
    const Iy = h * t * xb ** 2 + 2 * ((t * b ** 3) / 12 + b * t * (b / 2 - xb) ** 2) + 2 * cl * t * (b - xb) ** 2
    const Sx = Ix / (H / 2)
    return {
      name, kind: 'CC', rolled: false, d: H, bf: B, tw: t, tf: t, h: H - 2 * t, A, Ix, Iy,
      Sx, Sy: Iy / Math.max(xb + t / 2, B - xb - t / 2),
      Zx: Sx, Zy: Iy / Math.max(xb + t / 2, B - xb - t / 2), // 박판 → 소성 여유 미고려(탄성)
      rx: Math.sqrt(Ix / A), ry: Math.sqrt(Iy / A),
      J: (t ** 3 * (h + 2 * b + 2 * cl)) / 3,
      Cw: ((t * b ** 3 * h ** 2) / 12) * ((3 * b * t + 2 * h * t) / (6 * b * t + h * t)),
    }
  }
  if (kind === 'P') {
    const [D, t] = num(dims)
    const di = D - 2 * t
    const A = (Math.PI * (D ** 2 - di ** 2)) / 4
    const I = (Math.PI * (D ** 4 - di ** 4)) / 64
    const S = (2 * I) / D, Z = (D ** 3 - di ** 3) / 6
    return { name, kind: 'P', rolled: true, d: D, bf: D, tw: t, tf: t, h: di, A, Ix: I, Iy: I, Sx: S, Sy: S, Zx: Z, Zy: Z,
      rx: Math.sqrt(I / A), ry: Math.sqrt(I / A), J: 2 * I, Cw: 0 }
  }
  throw new Error(`section: unsupported ${name}`)
}

/** 단위중량 계산용 면적 (mm²) */
export const sectionArea = (name: string) => sectionProps(name).A
