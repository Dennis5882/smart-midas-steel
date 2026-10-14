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
  /** 지붕 마감 고정하중 — 경사면 면적 기준 (kN/m²) */
  roofDead: number
  /** 벽 마감 고정하중 (kN/m²) */
  wallDead: number
  sections: { column: string; rafter: string; purlin: string; girt: string; strut: string }
  material: string
}

export interface Node { id: number; x: number; y: number; z: number }
export type ElementRole = 'column' | 'rafter' | 'purlin' | 'girt' | 'strut'
export interface Element { id: number; n1: number; n2: number; role: ElementRole; section: string }

/** 전역: X = 스팬 방향, Y = 길이 방향, Z = 높이 */
export interface FactoryModel { nodes: Node[]; elements: Element[] }

export const DEFAULT_SPEC: FactorySpec = {
  code: 'TW',
  span: 24, bays: 6, baySpacing: 6, eaveHeight: 8, roofSlope: 0.1,
  baseFixity: 'pinned', purlinSpacing: 1.5, girtSpacing: 1.5,
  /* ⚠ 마감 하중은 가정값(금속 지붕 패널+단열 / 벽 패널) — 사용자 입력으로 대체 */
  roofDead: 0.15,
  wallDead: 0.1,
  /* Gen NX CNS2020.sdb 단면명 (RH = 압연 H, CC = 립 C형강 '치수/두께') */
  sections: { column: 'RH 500x200x10x16', rafter: 'RH 450x200x9x14', purlin: 'CC 200x75x20/3.2', girt: 'CC 150x65x20/3.2', strut: 'RH 200x100x5.5x8' },
  material: 'SN400B',
}
