/* 물량 산출 (순수 함수, 평가 보고서 C단계) — 부재 + 접합재(판·볼트·앵커) + 용접 길이(추정) + 도장 면적 + 로스 포함 발주 중량.
   접합재는 접합부 결과 dims 의 규격 문자열을 읽는다 (TW connections.ts / CN cnConnections.ts 공통 형식):
     판 'PL B×N×t' (x 도 허용) · 볼트/앵커 'n-M d' · 스티프너 '2-PL b×t' · 더블러 TW note 'doubler t mm' / CN dims 'PL t' · 가새 거셋 TW 'PL t' / CN 'PL w×t'.
   접합 개수(모델에서): 주각·처마 = 골조 기둥 수(2 × 골조 수), 마루 = 골조 수, 가새 단부 = 가새 요소 × 2.
   추정(est) 항목: 스티프너 길이 = 기둥 웨브 순높이, 더블러 = 기둥 웨브 순높이 × 지붕보 춤, 거셋 크기(TW 는 두께만 → 200×200 가정),
   용접 = 단부판 접합 1 곳당 플랜지 CJP 2·bf + 웨브 필렛 2·h. 풍주 주각·퍼린/거트 클립·새그로드·마감재는 제외. */
import type { ConnResult } from './connections'
import { memberSchedule, type ScheduleRow } from './schedule'
import { sectionProps } from './sections'
import { ROLES, type ElementRole, type FactoryModel, type FactorySpec } from './types'

/** 로스율 (가정) — 부재 5 %, 판재 10 % */
export const LOSS = { member: 0.05, plate: 0.1 }
const STEEL_KG_MM3 = 7.85e-6

export type ConnType = ConnResult['type']
export interface PlateRow { type: ConnType; part: 'plate' | 'stiffener' | 'doubler' | 'gusset'; size: string; perConn: number; conns: number; kg: number; est: boolean }
export interface BoltRow { type: ConnType; kind: 'bolt' | 'anchor'; size: string; perConn: number; conns: number; total: number }
export interface WeldRow { type: ConnType; cjp: number; fillet: number; conns: number }
export interface PaintRow { role: ElementRole; section: string; area: number }
export interface Quantities {
  members: ScheduleRow[]; memberT: number
  plates: PlateRow[]; plateT: number
  bolts: BoltRow[]
  welds: WeldRow[]; cjpM: number; filletM: number
  paint: PaintRow[]; paintM2: number
  netT: number; orderT: number
}

const plateRe = /PL\s*(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)/
const nM = /(\d+)-M(\d+)/

/** 단면 둘레(mm) — 도장 면적용. H: 외곽 2d + 4bf − 2tw, CC: 판 양면(중심선 전개 × 2), P: 외면 πD */
function perimeter(section: string): number {
  const p = sectionProps(section)
  if (p.kind === 'H') return 2 * p.d + 4 * p.bf - 2 * p.tw
  if (p.kind === 'P') return Math.PI * p.d
  return 2 * (p.A / p.tw) // CC: A = t × 전개 길이
}

export function quantities(spec: FactorySpec, model: FactoryModel, conns: ConnResult[] | null): Quantities {
  const sch = memberSchedule(spec, model)
  const nodes = new Map(model.nodes.map((n) => [n.id, n]))
  const frames = new Set(model.elements.filter((e) => e.role === 'rafter').map((e) => nodes.get(e.n1)!.y.toFixed(3))).size
  const countOf: Record<ConnType, number> = {
    base: 2 * frames, knee: 2 * frames, apex: frames,
    brace: 2 * model.elements.filter((e) => e.role === 'brace').length,
  }
  const col = sectionProps(spec.sections.column), raf = sectionProps(spec.sections.rafter)
  const plates: PlateRow[] = [], bolts: BoltRow[] = [], welds: WeldRow[] = []
  const addPlate = (type: ConnType, part: PlateRow['part'], b: number, l: number, t: number, perConn: number, est: boolean) =>
    plates.push({ type, part, size: `PL ${Math.round(b)}×${Math.round(l)}×${t}`, perConn, conns: countOf[type], kg: b * l * t * STEEL_KG_MM3 * perConn * countOf[type], est })
  const addBolt = (type: ConnType, kind: BoltRow['kind'], s: unknown) => {
    const m = String(s ?? '').match(nM)
    if (m) bolts.push({ type, kind, size: `M${m[2]}`, perConn: +m[1], conns: countOf[type], total: +m[1] * countOf[type] })
  }

  for (const c of conns ?? []) {
    const d = c.dims
    const pl = String(d.plate ?? '').match(plateRe)
    /* 단부판·베이스플레이트: 마루 이음은 양쪽 지붕보 끝에 1 장씩 */
    if (pl) addPlate(c.type, 'plate', +pl[1], +pl[2], +pl[3], c.type === 'apex' ? 2 : 1, false)
    if (c.type === 'base') addBolt('base', 'anchor', d.anchors)
    else addBolt(c.type, 'bolt', d.bolts)
    const st = String(d.stiffener ?? '').match(/(\d+)-PL\s*(\d+)\s*[x×]\s*(\d+)/)
    if (st) addPlate(c.type, 'stiffener', +st[2], col.h, +st[3], +st[1], true)
    const dbl = c.notes.find((n) => n.startsWith('doubler'))?.match(/(\d+)/)?.[1] ?? String(d.doubler ?? '').match(/PL\s*(\d+)/)?.[1]
    if (dbl && +dbl > 0) addPlate(c.type, 'doubler', col.h, raf.d, +dbl, 1, true)
    if (c.type === 'brace') {
      const g = String(d.gusset ?? '').match(/PL\s*(\d+)(?:\s*[x×]\s*(\d+))?/)
      if (g) { const [w, t] = g[2] ? [+g[1], +g[2]] : [200, +g[1]]; addPlate('brace', 'gusset', w, w, t, 1, true) }
    }
    /* 용접 (단부판 접합): 주각 = 기둥–베이스판, 처마 = 지붕보–단부판, 마루 = 양쪽 지붕보–단부판 */
    const mem = c.type === 'base' ? col : raf
    if (c.type !== 'brace') {
      const k = c.type === 'apex' ? 2 : 1
      welds.push({ type: c.type, cjp: (2 * mem.bf * k) / 1000, fillet: (2 * mem.h * k) / 1000, conns: countOf[c.type] })
    }
  }

  const paint: PaintRow[] = sch.rows.map((r) => ({ role: r.role, section: r.section, area: (perimeter(r.section) / 1000) * r.length }))
  const plateT = plates.reduce((s, p) => s + p.kg, 0) / 1000
  const netT = sch.total + plateT
  return {
    members: sch.rows, memberT: sch.total,
    plates: plates.sort((a, b) => ['base', 'knee', 'apex', 'brace'].indexOf(a.type) - ['base', 'knee', 'apex', 'brace'].indexOf(b.type)), plateT,
    bolts,
    welds, cjpM: welds.reduce((s, w) => s + w.cjp * w.conns, 0), filletM: welds.reduce((s, w) => s + w.fillet * w.conns, 0),
    paint: paint.sort((a, b) => ROLES.indexOf(a.role) - ROLES.indexOf(b.role)), paintM2: paint.reduce((s, p) => s + p.area, 0),
    netT, orderT: sch.total * (1 + LOSS.member) + plateT * (1 + LOSS.plate),
  }
}
