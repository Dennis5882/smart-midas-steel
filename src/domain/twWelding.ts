/* 대만 용접 근거 표 (순수) — 계산서 8장·DXF 접합 일람의 확인 항목. 용접 상세 설계(이음 형상·예열)는 범위 밖.
   근거: 鋼構造設計技術規範 LRFD 10.2(필릿 강도 표10.2-5, 앱 검토)·13.2.1(4)(CJP 상칭 용접재 −29 ℃ 27 J),
   鋼構造施工規範(AWS D1.1 인용), AWS D1.8 = 내진 보충 — 횡력저항 골조(13장 대상)의 모멘트 접합 플랜지 CJP·고정 주각 CJP 를
   Demand Critical 후보로 표시 (AISC 341 관례). 최종 판정·인성 시험은 설계자 확인. */
import type { ConnResult } from './connections'
import type { FactorySpec } from './types'

export interface WeldRow {
  type: ConnResult['type']
  joint: 'flangeCJP' | 'webFillet' | 'gussetFillet'
  /** 필릿 크기 mm (CJP 는 없음) */
  size?: number
  standard: 'AWS D1.1' | 'AWS D1.1 + D1.8'
  demandCritical: boolean
}

const filletOf = (c: ConnResult) => Number(/fillet (\d+(?:\.\d+)?) mm/.exec(String(c.dims.weld ?? ''))?.[1]) || undefined

export function weldSchedule(spec: FactorySpec, cs: ConnResult[] | null): WeldRow[] {
  if (spec.code !== 'TW' || !cs?.length) return []
  const out: WeldRow[] = []
  for (const c of cs) {
    if (c.type === 'brace') { out.push({ type: c.type, joint: 'gussetFillet', standard: 'AWS D1.1', demandCritical: false }); continue }
    /* 처마·마루 단부판, 주각: 플랜지 CJP + 웨브 필릿 (connections.ts 상세) */
    const sfrs = c.type === 'knee' || (c.type === 'base' && spec.baseFixity === 'fixed')
    out.push({ type: c.type, joint: 'flangeCJP', standard: sfrs ? 'AWS D1.1 + D1.8' : 'AWS D1.1', demandCritical: sfrs })
    out.push({ type: c.type, joint: 'webFillet', size: filletOf(c), standard: 'AWS D1.1', demandCritical: false })
  }
  return out
}
