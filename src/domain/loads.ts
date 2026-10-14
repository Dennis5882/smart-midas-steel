/* 하중 케이스·보하중·하중조합 → Gen NX 페이로드 (순수 함수). 단위 kN, m.
   M1.5 범위: 고정하중(자중 + 지붕/벽 마감) · 지붕 활하중. 풍·지진은 대만 규범 입력 정의 후 추가. */
import { profileOf } from '../codes'
import type { LoadCaseType } from '../codes'
import type { FactoryModel, FactorySpec } from './types'

/** Gen 케이스 이름 → 조합에서의 하중 종류 (LRFD 2.2 의 L = 지붕 활하중 포함 모든 활하중) */
export const CASES = { D: { name: 'D', type: 'D' as const, kind: 'D' as LoadCaseType }, LR: { name: 'LR', type: 'LR' as const, kind: 'L' as LoadCaseType } }

export interface LoadPayloads {
  STLD: Record<string, unknown>
  BODF: Record<string, unknown>
  BMLD: Record<string, unknown>
  'LCOM-GEN': Record<string, unknown>
  /** 지붕 활하중 값 (kN/m², 수평투영) — 보고용 */
  roofLive: number
}

export function buildLoadPayloads(spec: FactorySpec, model: FactoryModel): LoadPayloads {
  const prof = profileOf(spec.code)
  const { span, eaveHeight, roofSlope, baySpacing, purlinSpacing, girtSpacing } = spec

  /* 실제 2차부재 간격 (buildPortal 이 등분하므로 요청 간격과 다를 수 있음) */
  const slopeLen = Math.hypot(span / 2, (span / 2) * roofSlope)
  const nPurlin = Math.max(1, Math.round(slopeLen / purlinSpacing))
  const sRoof = slopeLen / nPurlin // 경사 방향 간격
  const cosT = Math.cos(Math.atan(roofSlope))
  const gWall = eaveHeight / Math.max(1, Math.round(eaveHeight / girtSpacing))

  /* 활하중: 퍼린 부담 수평투영면적 = 베이 간격 × 수평 간격 */
  const qLive = prof.roofLive({ slope: roofSlope, tribArea: baySpacing * sRoof * cosT })

  const nodeById = new Map(model.nodes.map((n) => [n.id, n]))
  const BMLD: Record<string, { ITEMS: unknown[] }> = {}
  const addLine = (elemId: number, lc: string, w: number) => {
    if (w === 0) return
    const items = (BMLD[elemId] ??= { ITEMS: [] }).ITEMS
    items.push({
      ID: items.length + 1, LCNAME: lc, GROUP_NAME: '', CMD: 'BEAM', TYPE: 'UNILOAD', DIRECTION: 'GZ',
      USE_PROJECTION: false, USE_ECCEN: false, D: [0, 1, 0, 0], P: [-w, -w, 0, 0],
    })
  }

  for (const e of model.elements) {
    if (e.role !== 'purlin' && e.role !== 'strut' && e.role !== 'girt') continue
    const x = nodeById.get(e.n1)!.x
    if (e.role === 'girt') {
      addLine(e.id, CASES.D.name, spec.wallDead * gWall)
      continue
    }
    /* 지붕: 처마 스트럿 = 반 간격 + 벽 반 간격, 마루 스트럿 = 양쪽 반 간격 = 1 간격, 퍼린 = 1 간격 */
    const eave = x === 0 || x === span
    const sTrib = eave ? sRoof / 2 : sRoof
    addLine(e.id, CASES.D.name, spec.roofDead * sTrib + (eave ? spec.wallDead * (gWall / 2) : 0))
    addLine(e.id, CASES.LR.name, qLive * sTrib * cosT)
  }

  const avail = new Set<LoadCaseType>(['D', 'L'])
  const caseName: Partial<Record<LoadCaseType, string>> = { D: CASES.D.name, L: CASES.LR.name }
  const LCOM: Record<string, unknown> = {}
  let no = 0
  for (const c of prof.combos({ heavyLive: false })) {
    if (!c.terms.every(([k]) => avail.has(k))) continue // 풍·지진 케이스 정의 전에는 해당 조합 생략
    no++
    LCOM[no] = {
      NAME: `${prof.method} ${c.ref}`, ACTIVE: 'ACTIVE', iTYPE: 0,
      DESC: c.terms.map(([k, f]) => `${f}${k}`).join('+'),
      vCOMB: c.terms.map(([k, f]) => ({ ANAL: 'ST', LCNAME: caseName[k], FACTOR: f })),
    }
  }

  return {
    STLD: {
      1: { NAME: CASES.D.name, TYPE: CASES.D.type, DESC: 'Dead' },
      2: { NAME: CASES.LR.name, TYPE: CASES.LR.type, DESC: 'Roof live' },
    },
    BODF: { 1: { LCNAME: CASES.D.name, GROUP_NAME: '', FV: [0, 0, -1] } },
    BMLD,
    'LCOM-GEN': LCOM,
    roofLive: qLive,
  }
}
