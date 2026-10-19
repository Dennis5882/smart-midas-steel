/* 대만 — 鋼構造建築物鋼結構設計技術規範 LRFD.
   하중조합: LRFD 2.2 (式 2.2-1~2.2-6) — 원문 KB: COde/TW/knowledge/steel-design-technical-code/LRFD-02-載重.md
   2.2 의 E 는 耐震規範 E 에서 αy = 1.0 으로 둔 값.
   강재 종류: LRFD 3.2 (CNS 13812 SN400A/B/C·SN490B/C, CNS 2947 SM400~SM570), 내진부재 13.2.1.
   Gen NX 라이브 확인(2026-10-14): db/DSTL `TWN-LSD90` 수용, db/SECT DBUSER `CNS2020`(`RH 400x200x8x13`) 수용,
   db/MATL STEEL `CNS(S)`·`CNS06(S)` 의 DB = SS400·SM400·SM490·SM490Y·SM520·SM570·SN400·SN490 (SN400B 등 등급 접미사는 거부). */
import type { CodeProfile } from './types'
import * as L from './twLateral'

export const TW: CodeProfile = {
  id: 'TW',
  labelKey: 'code_TW',
  /* 판본: 內政部 法規沿革 GL000143 — 96年6月11日 修正發布, 99年9月16日 13.2 點 修正 (2026-10-19 확인, 통합 개정은 110년 연구 초안 단계) */
  basisLabelKey: 'code_TW_basis',
  method: 'LRFD',
  /* ⚠ fy·fu 는 CNS 13812/2947 두께 ≤ 40mm 통상값 — KB 에 수치 표가 없어 원문 대조 전 (두께 > 40mm 는 fy 가 낮아짐) */
  materials: {
    SN400B: { fy: 235, fu: 400, E: 200000, nu: 0.3, gamma: 77, gen: { standard: 'CNS(S)', db: 'SN400' } },
    SN490B: { fy: 325, fu: 490, E: 200000, nu: 0.3, gamma: 77, gen: { standard: 'CNS(S)', db: 'SN490' } },
    SM490A: { fy: 325, fu: 490, E: 200000, nu: 0.3, gamma: 77, gen: { standard: 'CNS(S)', db: 'SM490' } },
    /* v2.4.9 추가 — LRFD 3.2 의 CNS 2947 SM400A·SM490YA·SM520B, CNS 2473 SS400 (용접 주구조·13.2.1 내진 부재 목록 밖 → scope twMatSS),
       ASTM A36·A572 Gr.50·A992 (3.2 목록 밖 → 3.1.2 검사·13.2.1 동등성, scope twMatImported). Gen DB 이름은 DLL 문자열(ASTM(S) A36·A572-50·A992). */
    SM400A: { fy: 235, fu: 400, E: 200000, nu: 0.3, gamma: 77, gen: { standard: 'CNS(S)', db: 'SM400' } },
    SM490YA: { fy: 355, fu: 490, E: 200000, nu: 0.3, gamma: 77, gen: { standard: 'CNS(S)', db: 'SM490Y' } },
    SM520B: { fy: 355, fu: 520, E: 200000, nu: 0.3, gamma: 77, gen: { standard: 'CNS(S)', db: 'SM520' } },
    SS400: { fy: 235, fu: 400, E: 200000, nu: 0.3, gamma: 77, gen: { standard: 'CNS(S)', db: 'SS400' } },
    A36: { fy: 250, fu: 400, E: 200000, nu: 0.3, gamma: 77, gen: { standard: 'ASTM(S)', db: 'A36' } },
    A572Gr50: { fy: 345, fu: 450, E: 200000, nu: 0.3, gamma: 77, gen: { standard: 'ASTM(S)', db: 'A572-50' } },
    A992: { fy: 345, fu: 450, E: 200000, nu: 0.3, gamma: 77, gen: { standard: 'ASTM(S)', db: 'A992' } },
  },
  defaultMaterial: 'SN400B',
  /* ⚠ 두께별 Fy — CNS 13812(SN)·2947(SM) = JIS G3136·G3106 통상값 (KB 에 표 없음, 원문 대조 전): SN 은 40 mm 초과 −20 MPa(400)·−30 MPa(490),
     SM490A 는 16 / 40 mm 경계 */
  fyAt: (m, t) => {
    const T: Record<string, [number, number][]> = {
      SN400B: [[40, 235], [100, 215]], SN490B: [[40, 325], [100, 295]], SM490A: [[16, 325], [40, 315], [100, 295]],
      /* JIS G3106·G3101 (= CNS 2947·2473) 두께 구분 통상값, ASTM A6/A36·A572·A992 최소 항복 (원문 대조 전) */
      SM400A: [[16, 245], [40, 235], [100, 215]], SS400: [[16, 245], [40, 235], [100, 215]],
      SM490YA: [[16, 365], [40, 355], [75, 335], [100, 325]], SM520B: [[16, 365], [40, 355], [75, 335], [100, 325]],
      A36: [[200, 250]], A572Gr50: [[100, 345]], A992: [[100, 345]],
    }
    const row = T[m]?.find(([tm]) => t <= tm)
    return row ? row[1] : T[m]?.at(-1)?.[1] ?? 235
  },
  gen: {
    sectionDb: 'CNS2020',
    designCode: 'TWN-LSD90',
    /* CNS2020.sdb 단면명 접두 → db/SECT SHAPE (RH·BH = H, CC = 립 C형강 — 라이브 확인, 'C'·'LC' 는 거부) */
    shapeOf: (name) => {
      const p = name.split(' ')[0]
      return p === 'RH' || p === 'BH' ? 'H' : p === 'BB' ? 'B' : p
    },
  },
  lateral: {
    period: L.period,
    seismicCoef: L.seismicCoef,
    windQ: L.windQ,
    gust: L.GUST,
    gcpi: L.gcpi,
    wallCp: { windward: L.WALL_CP_WINDWARD, leeward: L.wallCpLeeward },
    roofCp: L.roofCp,
  },
  /* 建築技術規則 建築構造編 第26條 — 不作用途之屋頂 水平投影面活載重 (kgf/m²), 載重面積 ≤20 / 20~60 / >60 m².
     平頂(1/6 미만 경사로 간주) 100/80/60, 1/6~1/2 坡頂 80/70/60, 1/2 이상 60. 拱頂 행은 제외. */
  roofLive: ({ slope, tribArea }) => {
    const rows = slope < 1 / 6 ? [100, 80, 60] : slope < 1 / 2 ? [80, 70, 60] : [60, 60, 60]
    const kgf = tribArea <= 20 ? rows[0] : tribArea <= 60 ? rows[1] : rows[2]
    return (kgf * 9.80665) / 1000
  },
  combos: ({ heavyLive }) => {
    const lw = heavyLive ? 1.0 : 0.5 // 2.2-3·2.2-4: 차고·공중이용·활하중 > 0.5 tf/m² 이면 L 계수 1.0
    return [
      { ref: '2.2-1', terms: [['D', 1.4]] },
      { ref: '2.2-2', terms: [['D', 1.2], ['L', 1.6]] },
      { ref: '2.2-3', terms: [['D', 1.2], ['L', lw], ['W', 1.6]] },
      { ref: '2.2-4', terms: [['D', 1.2], ['L', lw], ['E', 1.0]] },
      { ref: '2.2-5', terms: [['D', 0.9], ['E', 1.0]] },
      { ref: '2.2-6', terms: [['D', 0.9], ['W', 1.6]] },
    ]
  },
  /* LRFD 13.3 放大設計地震力: E′ = 1.4·Fu·E (Fu ≤ 2.5), (13.3-1) 1.2D + 0.5L ± E′, (13.3-2) 0.9D ± E′ — 직교 방향 동시 고려 불요.
     사용처: 13.4.1 기둥 축력, 13.4.5 주각·앵커, 13.8.4 저층 가새 구조 부재·접합. 13.6.1-2 접합 전단용 중력 조합 1.2D + 0.5L. */
  seismicCombos: {
    omega: (Fu) => 1.4 * Math.min(Fu, 2.5),
    combos: ({ heavyLive }) => [
      { ref: '13.3-1', kind: 'amplified', terms: [['D', 1.2], ['L', heavyLive ? 1.0 : 0.5], ['E', 1.0]] },
      { ref: '13.3-2', kind: 'amplified', terms: [['D', 0.9], ['E', 1.0]] },
      { ref: '13.6.1', kind: 'gravity', terms: [['D', 1.2], ['L', heavyLive ? 1.0 : 0.5]] },
    ],
  },
  unverified: true,
}
