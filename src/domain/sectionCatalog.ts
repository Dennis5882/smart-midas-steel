/** Audited choices for modeling and repair selectors. Never substitutes Gen properties into calculations. */
import audit from '../data/section-catalog-audit.json'
import type { CodeId } from '../codes/types'
import type { ElementRole } from './types'
import type { FactorySpec } from './types'
import { genSectionRecord } from './sections'
import { TW_Z } from '../codes/twZ'
import { TW } from '../codes/tw'

export interface AuditedSection {
  code: string; name: string; db: string; shape: string; roles: string[]; registered: boolean
  propertyStatus: string; selectionStatus: string; maxRelativeDifference: number
  relativeDifferences: Record<string, number>
  materialSupport: Record<string, { status: string; reasons: string[] } | undefined>
  reasons: string[]
}

/** Review items remain explicitly labelled; quarantine and unsupported materials are always excluded. */
/** TW 립 Z형강 — Gen DB 에 없어 치수 성질·립 C 대리 단면 (codes/twZ). 퍼린·거트, 수동 선택 전용 (자동 최적화 후보 아님) */
const zEntries = (code: CodeId, role: ElementRole, material: string): AuditedSection[] => code !== 'TW' || !(role === 'purlin' || role === 'girt') || !TW.materials[material] ? [] : TW_Z.map((name) => ({
  code, name, db: 'dimensions', shape: 'Z', roles: ['purlin', 'girt'], registered: true, propertyStatus: 'dimensions', selectionStatus: 'normal', maxRelativeDifference: 0,
  relativeDifferences: {}, materialSupport: { [material]: { status: 'preliminary', reasons: [] } }, reasons: [],
}))
export function sectionCatalogOptions(code: CodeId, role: ElementRole, material: string, includeReview = true): AuditedSection[] {
  return [...auditOptions(code, role, material, includeReview), ...(includeReview ? zEntries(code, role, material) : [])]
}
function auditOptions(code: CodeId, role0: ElementRole, material: string, includeReview: boolean): AuditedSection[] {
  /* 트러스 하현재 = 지붕보 후보(H), 웨브 = 가새 후보(강관) */
  const role = role0 === 'chord' ? 'rafter' : role0 === 'web' ? 'brace' : role0
  return (audit.entries as AuditedSection[]).filter((r) => r.code === code && r.roles.includes(role)
    && r.registered && r.selectionStatus !== 'quarantine'
    && !!r.materialSupport[material] && r.materialSupport[material]?.status !== 'blocked')
    .map((r) => {
      const source = genSectionRecord(r.name, code)
      return source && !source.excluded ? { ...r, propertyStatus: 'gen-db', selectionStatus: 'normal' } : r
    }).filter((r) => includeReview || r.selectionStatus === 'normal')
}

export const sectionCatalogAuditDate = audit.auditedAt

/** Match the material actually assigned by buildGenPayloads, including legacy specs. */
export function modelingSectionChoices(spec: FactorySpec, role: ElementRole, current: string) {
  const secondary = (spec.code === 'CN' || spec.code === 'KR' || (spec.code === 'TW' && !!spec.secondaryMaterial)) && (role === 'purlin' || role === 'girt')
  const material = secondary ? spec.secondaryMaterial ?? (spec.code === 'KR' ? 'SS275' : spec.code === 'CN' ? 'Q235B' : spec.material) : spec.material
  const options = sectionCatalogOptions(spec.code, role, material)
  const selected = options.find((o) => o.name === current)
  const source = current ? genSectionRecord(current, spec.code) : undefined
  return { material, options, selected, excluded: !!source?.excluded, source: source?.excluded ? undefined : source,
    propertyReview: selected?.selectionStatus === 'review',
    preliminary: selected?.materialSupport[material]?.status === 'preliminary' }
}
