/* Compare load payloads by IDs, not array order. Gen may add default fields;
   every field we sent must still be present with the same value. */
type RecordValue = Record<string, unknown>
export const isRecord = (v: unknown): v is RecordValue => !!v && typeof v === 'object' && !Array.isArray(v)

export function loadDifference(expected: unknown, actual: unknown, path: string): string | null {
  if (typeof expected === 'number') return typeof actual === 'number' && Number.isFinite(actual) && Math.abs(expected - actual) <= 1e-9 * Math.max(1, Math.abs(expected)) ? null : path
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || actual.length !== expected.length) return `${path}.length`
    if (path.endsWith('.ITEMS')) {
      if (!expected.every((v) => isRecord(v) && typeof v.ID === 'number') || !actual.every((v) => isRecord(v) && typeof v.ID === 'number')) return `${path}.ID`
      const byId = new Map(actual.map((v) => [v.ID, v]))
      if (byId.size !== actual.length) return `${path}.ID (duplicate)`
      for (const item of expected) { const d = loadDifference(item, byId.get(item.ID), `${path}[ID=${item.ID}]`); if (d) return d }
      return null
    }
    for (let i = 0; i < expected.length; i++) { const d = loadDifference(expected[i], actual[i], `${path}[${i}]`); if (d) return d }
    return null
  }
  if (isRecord(expected)) {
    if (!isRecord(actual)) return path
    for (const [k, v] of Object.entries(expected)) { const d = loadDifference(v, actual[k], `${path}.${k}`); if (d) return d }
    return null
  }
  return expected === actual ? null : path
}
