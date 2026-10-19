/** Run a live script with the user's open Gen document saved first and restored afterwards (12 DB hashes compared).
    Usage: node --import tsx scripts/live-guarded.ts -- scripts/live-tw.ts --frame truss --optimize
    Key: .env / env (scripts/mapi-key.ts) — never printed or passed as an argument. */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { MidasClient } from 'midas-nx'
import { readMapiKey } from './mapi-key'

const sep = process.argv.indexOf('--')
assert.ok(sep > 0 && process.argv[sep + 1], 'Pass the live script after --')
const key = await readMapiKey(), client = new MidasClient({ mapiKey: key, product: 'gen', timeout: 180000 })
const dbs = ['UNIT', 'MATL', 'SECT', 'NODE', 'ELEM', 'CONS', 'FRLS', 'STLD', 'LCOM-GEN', 'BODF', 'BMLD', 'CNLD']
const canonical = (x: unknown) => JSON.stringify(x, (_, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, v[k]])) : v)
const snapshot = async () => { const out: Record<string, string> = {}; for (const db of dbs) out[db] = createHash('sha256').update(canonical(await client.request('GET', `/db/${db}`))).digest('hex'); return out }
const command = async (path: string, arg: string) => { const j: any = await client.request('POST', path, { Argument: arg }); assert.equal(j.message, 'MIDAS GEN NX command complete', path) }
const before = await snapshot(), backup = `C:/temp/sms_guard_backup_${Date.now()}.mgbx`
await command('/doc/saveas', backup); console.log('backup saved')
let rc = 1
try {
  rc = spawnSync(process.execPath, ['--stack-size=500', '--import', 'tsx', ...process.argv.slice(sep + 1)], { stdio: 'inherit', env: { ...process.env, MAPI_KEY: key } }).status ?? 1
} finally {
  try { await command('/doc/saveas', `C:/temp/sms_guard_scratch_${Date.now()}.mgbx`) }
  finally { await command('/doc/open', backup); assert.deepEqual(await snapshot(), before, 'Original document restoration mismatch'); console.log('restored original: 12 DB hashes match') }
}
process.exit(rc)
