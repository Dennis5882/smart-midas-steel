/* 풍하중 미리보기 (순수) — 하중 입력 단계에서 '실제로 Gen 에 넣는 풍하중'을 보여 준다.
   케이스마다 풍향·내압·수평 합력·지붕 상향력을 실제 페이로드(BMLD·CNLD)에서 합산 — 기준(TW·KR·CN)과 무관하게 같은 방식.
   엔지니어가 기본 입력 칸(V10·지표면 조도)만 보고 '기본 풍하중만 넣는다'고 오해하던 문제(2026-10-20 현지 피드백) */
import type { LoadPayloads, WindProfile } from './loads'
import type { FactoryModel } from './types'

export type WindRowKind = 'main' | 'across' | 'torsion'
export interface WindRow {
  name: string
  kind: WindRowKind
  /** 순풍향 케이스의 풍향 (합력 부호), 횡풍향은 작용 방향, 비틀림은 null */
  dir: '+X' | '-X' | '+Y' | '-Y' | null
  /** 내압 계수 (부호 포함) — CN 은 ±1 표지(+i/−i), 모르면 null */
  gcpi: number | null
  /** 풍상 지붕 Cp(μw) — 표에 두 값이 있는 경우 어느 쪽인지 */
  roofCp: number | null
  /** 수평 합력 (kN) — 순풍향 방향 성분 */
  horizontal: number
  /** 지붕 상향력 합 (kN, + = 위) */
  uplift: number
}
/** profile: 높이별 풍압 (TW — 풍상벽 q(z)) */
export interface WindSummary { rows: WindRow[]; qh: number; hRef: number; profile?: WindProfile }

export function windSummary(model: FactoryModel, loads: LoadPayloads): WindSummary {
  const nodes = new Map(model.nodes.map((n) => [n.id, n]))
  const len = new Map(model.elements.map((e) => { const a = nodes.get(e.n1)!, b = nodes.get(e.n2)!; return [e.id, Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)] }))
  const windCases = Object.values(loads.STLD as Record<string, { NAME: string; TYPE: string }>).filter((c) => c.TYPE === 'W').map((c) => c.NAME)
  const tot = new Map(windCases.map((c) => [c, { x: 0, y: 0, z: 0 }]))
  for (const [id, rec] of Object.entries(loads.BMLD as Record<string, { ITEMS: any[] }>)) for (const it of rec.ITEMS) {
    const t = tot.get(it.LCNAME)
    if (!t || it.TYPE !== 'UNILOAD') continue
    const f = ((it.P[0] + it.P[1]) / 2) * (len.get(+id) ?? 0) * Math.abs((it.D?.[1] ?? 1) - (it.D?.[0] ?? 0))
    if (it.DIRECTION === 'GX') t.x += f; else if (it.DIRECTION === 'GY') t.y += f; else if (it.DIRECTION === 'GZ') t.z += f
  }
  for (const rec of Object.values(loads.CNLD as Record<string, { ITEMS: any[] }>)) for (const it of rec.ITEMS) {
    const t = tot.get(it.LCNAME)
    if (t) { t.x += it.FX; t.y += it.FY; t.z += it.FZ }
  }
  const info = new Map(loads.info.wind.cases.map((c) => [c.name, c]))
  const rows = windCases.map((name): WindRow => {
    const t = tot.get(name)!, c = info.get(name)
    const H = Math.max(Math.abs(t.x), Math.abs(t.y))
    const kind: WindRowKind = H < 1e-6 && Math.abs(t.z) < 1e-6 ? 'torsion' : c ? 'main' : 'across'
    const axis = Math.abs(t.x) >= Math.abs(t.y) ? 'X' : 'Y'
    const v = axis === 'X' ? t.x : t.y
    return {
      name, kind, dir: kind === 'torsion' ? null : (`${v < 0 ? '-' : '+'}${axis}` as WindRow['dir']),
      gcpi: c ? c.gcpi : null, roofCp: c ? c.roofCp : null,
      horizontal: kind === 'torsion' ? 0 : Math.abs(v), uplift: t.z,
    }
  })
  return { rows, qh: loads.info.wind.qh, hRef: loads.info.wind.hRef, profile: loads.info.wind.profile }
}
