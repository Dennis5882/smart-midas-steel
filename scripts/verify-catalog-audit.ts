import assert from 'node:assert/strict'
import audit from '../src/data/section-catalog-audit.json'
import { sectionCatalogOptions } from '../src/domain/sectionCatalog'

assert.equal(audit.entries.length, 808)
assert.equal(audit.independentTableMatches, 808)
assert.equal(audit.originalModelRestored, true)
assert.equal(new Set(audit.entries.map((r) => `${r.code}:${r.db}:${r.name}`)).size, 808)
assert.ok(audit.entries.every((r) => r.registered))
const excluded = ['RH 918x303x19x37', 'HN 550x200x10/16', 'HW 344x348x10/16', 'HW 344x354x16/16', 'CC 100x50x15x2.5', 'P 108x5.5', 'LH 125x125x3.2/4.5', 'LH 150x150x3.2/4.5']
assert.deepEqual(audit.entries.filter((r) => r.selectionStatus === 'quarantine').map((r) => r.name).sort(), excluded.sort())
for (const code of ['TW', 'CN', 'KR'] as const) {
  const material = code === 'TW' ? 'SN400B' : code === 'CN' ? 'Q235B' : 'SS275'
  for (const role of ['column', 'rafter', 'purlin', 'girt', 'brace'] as const) {
    const options = sectionCatalogOptions(code, role, material)
    assert.ok(options.every((r) => r.code === code && r.roles.includes(role) && !excluded.includes(r.name)))
    assert.ok(sectionCatalogOptions(code, role, material, false).every((r) => r.propertyStatus === 'close'))
    assert.equal(sectionCatalogOptions(code, role, 'UNKNOWN').length, 0)
  }
}
assert.ok(sectionCatalogOptions('TW', 'column', 'SN400B').some((r) => r.name === 'RH 600x200x11x17' && r.selectionStatus === 'review'))
assert.ok(sectionCatalogOptions('TW', 'brace', 'SN400B', false).length > 0)
assert.ok(sectionCatalogOptions('CN', 'purlin', 'Q345B').every((r) => r.shape !== 'CC'))
assert.ok(sectionCatalogOptions('KR', 'purlin', 'SSC275').some((r) => r.shape === 'CC' && r.materialSupport.SSC275.status === 'preliminary'))
console.log('Catalog audit passed: 808 unique registrations, independent table coverage, 8 quarantines, role/material/review filters.')
