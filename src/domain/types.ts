import type { CodeId } from '../codes'

/* 공장형 단경간 포털 프레임 입력 스펙. 단위: m, kN */
export interface FactorySpec {
  /** 설계기준 (UI 언어와 독립) */
  code: CodeId
  /** 프레임 스팬 (m) */
  span: number
  /** 길이 방향 베이 수 */
  bays: number
  /** 베이 간격 (m) */
  baySpacing: number
  /** 처마 높이 (m) */
  eaveHeight: number
  /** 지붕 경사 (rise/run, 예 0.1 = 1:10) */
  roofSlope: number
  /** 기둥 베이스 접합 */
  baseFixity: 'pinned' | 'fixed'
  /** 퍼린 간격 (경사 방향, m) */
  purlinSpacing: number
  /** 거트 간격 (높이 방향, m) */
  girtSpacing: number
  /** 박공벽 풍주(gable post) 목표 간격 (m) — 실제 위치는 지붕보 절점에 맞춤 */
  postSpacing: number
  /** 퍼린·거트 새그로드(횡지지) 수 / 베이 — 설계 비지지길이 Lb = 베이 간격 / (n+1) */
  sagRods: number
  /** 지진 입력 — SDS·SD1: 工址 설계 스펙트럼 계수, I: 용도계수, Rx/Ry: 구조계 R (표1-3) */
  seismic: { SDS: number; SD1: number; I: number; Rx: number; Ry: number }
  /** 풍 입력 — V10: 기본설계풍속(m/s), I: 풍 용도계수, exposure: 지표조도 A/B/C, enclosure: 封閉/部分封閉 */
  wind: { V10: number; I: number; exposure: 'A' | 'B' | 'C'; enclosure: 'enclosed' | 'partial' }
  /** 지붕 마감 고정하중 — 경사면 면적 기준 (kN/m²) */
  roofDead: number
  /** 벽 마감 고정하중 (kN/m²) */
  wallDead: number
  /** 기초 콘크리트 fc' (MPa) — 주각 지압 */
  fc: number
  /** 앵커볼트 인장강도 Fu (MPa) */
  anchorFu: number
  sections: { column: string; rafter: string; purlin: string; girt: string; strut: string; post: string; brace: string }
  material: string
}

export interface Node { id: number; x: number; y: number; z: number }
/** post = 박공벽 풍주, brace = X-가새(TRUSS) */
export type ElementRole = 'column' | 'rafter' | 'purlin' | 'girt' | 'strut' | 'post' | 'brace'
export const ROLES: ElementRole[] = ['column', 'rafter', 'purlin', 'girt', 'strut', 'post', 'brace']
/** wall: 벽 부재가 붙은 면 — 'x0'·'xL' = 측벽(x=0, x=스팬), 'y0'·'yL' = 박공벽(y=0, y=길이), 'roof' = 지붕 가새 */
export type Face = 'x0' | 'xL' | 'y0' | 'yL' | 'roof'
export interface Element { id: number; n1: number; n2: number; role: ElementRole; section: string; face?: Face }

/** 전역: X = 스팬 방향, Y = 길이 방향, Z = 높이 */
export interface FactoryModel { nodes: Node[]; elements: Element[] }

export const DEFAULT_SPEC: FactorySpec = {
  code: 'TW',
  span: 24, bays: 6, baySpacing: 6, eaveHeight: 8, roofSlope: 0.1,
  baseFixity: 'fixed', purlinSpacing: 1.5, girtSpacing: 1.5, postSpacing: 6, sagRods: 2,
  /* ⚠ 샘플값: SDS·SD1 은 임의(工址 표 조회 필요), Rx 3.2 = 部分韌性抗彎矩構架(鋼, h ≤ 12m, 표1-3), Ry 2.0 = 同心斜撐(h ≤ 12m).
     V10 42.5 = 臺北市 (風力規範 2.4), 지표조도 B 가정 */
  seismic: { SDS: 0.6, SD1: 0.35, I: 1.0, Rx: 3.2, Ry: 2.0 },
  wind: { V10: 42.5, I: 1.0, exposure: 'B', enclosure: 'enclosed' },
  /* ⚠ 마감 하중은 가정값(금속 지붕 패널+단열 / 벽 패널) — 사용자 입력으로 대체 */
  roofDead: 0.15,
  wallDead: 0.1,
  /* ⚠ 가정: fc' 280 kgf/cm² ≈ 27.5 MPa, 앵커 Fu 400 MPa (ASTM F1554 Gr.36 상당) */
  fc: 27.5,
  anchorFu: 400,
  /* Gen NX CNS2020.sdb 단면명 (RH = 압연 H, CC = 립 C형강 '치수/두께').
     샘플 단면은 라이브 설계 검토로 조정(2026-10-15): 핀 주각 RH500/RH450 은 풍 변위각 0.0109(> 0.005)·지붕보 처짐 L/235 로 NG.
     스트럿은 KL/r ≤ 200 (ry ≥ 30mm) 위해 RH150x150. */
  sections: { column: 'RH 600x200x11x17', rafter: 'RH 600x200x11x17', purlin: 'CC 200x75x20/4.0', girt: 'CC 150x65x20/3.2', strut: 'RH 150x150x7x10',
    post: 'RH 250x125x6x9', brace: 'P 139.8x4.5' },
  material: 'SN400B',
}
