/** Audited choices for the upcoming selector. Never substitutes Gen properties into calculations. */
import audit from '../data/section-catalog-audit.json'
import type { CodeId } from '../codes/types'
import type { ElementRole } from './types'

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
