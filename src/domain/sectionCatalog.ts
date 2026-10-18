/** Audited choices for modeling and repair selectors. Never substitutes Gen properties into calculations. */
import audit from '../data/section-catalog-audit.json'
import type { CodeId } from '../codes/types'
import type { ElementRole } from './types'
import type { FactorySpec } from './types'

export interface AuditedSection {
  code: string; name: string; db: string; shape: string; roles: string[]; registered: boolean
  propertyStatus: string; selectionStatus: string; maxRelativeDifference: number
  relativeDifferences: Record<string, number>
  materialSupport: Record<string, { status: string; reasons: string[] } | undefined>
  reasons: string[]
}

/** Review items remain explicitly labelled; quarantine and unsupported materials are always excluded. */
export function sectionCatalogOptions(code: CodeId, role: ElementRole, material: string, includeReview = true): AuditedSection[] {
  return (audit.entries as AuditedSection[]).filter((r) => r.code === code && r.roles.includes(role)
    && r.registered && r.selectionStatus !== 'quarantine'
    && (includeReview || r.selectionStatus === 'normal')
    && !!r.materialSupport[material] && r.materialSupport[material]?.status !== 'blocked')
}

export const sectionCatalogAuditDate = audit.auditedAt

/** Match the material actually assigned by buildGenPayloads, including legacy specs. */
export function modelingSectionChoices(spec: FactorySpec, role: ElementRole, current: string) {
  const secondary = (spec.code === 'CN' || spec.code === 'KR') && (role === 'purlin' || role === 'girt')
  const material = secondary ? spec.secondaryMaterial ?? (spec.code === 'KR' ? 'SS275' : 'Q235B') : spec.material
  const options = sectionCatalogOptions(spec.code, role, material)
  const selected = options.find((o) => o.name === current)
  return { material, options, selected,
    propertyReview: selected?.selectionStatus === 'review',
    preliminary: selected?.materialSupport[material]?.status === 'preliminary' }
}
