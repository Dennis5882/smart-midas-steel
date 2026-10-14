/* MAPI — midas-nx SDK(MidasClient) 래퍼. 브라우저가 로컬 MIDAS Gen에 직접 호출한다.
   path 가 '/' 로 시작하면 그대로, 아니면 /db/{path}. */
import { MidasAPIError, MidasClient, type JsonObject } from 'midas-nx'
import { S } from '../state/store'

/* 해석 등은 수 분 걸릴 수 있다 — SDK 기본 30s 대신 넉넉히 */
const TIMEOUT_MS = 15 * 60 * 1000

let cached: { key: string; base: string; client: MidasClient } | null = null

export function getClient(): MidasClient {
  const base = S.baseUrl.trim().replace(/\/$/, '')
  const key = S.mapiKey.trim()
  if (!cached || cached.key !== key || cached.base !== base) {
    cached = { key, base, client: new MidasClient({ mapiKey: key, baseUrl: base, product: 'gen', timeout: TIMEOUT_MS }) }
  }
  return cached.client
}

export function apiErrorMessage(e: unknown): string {
  if (e instanceof MidasAPIError) {
    const body = e.responseBody as any
    const m = body?.error?.message ?? (typeof body?.error === 'string' ? body.error : undefined) ?? body?.message
    if (m) return String(m)
    if (e.statusCode) return `HTTP ${e.statusCode}`
  }
  return e instanceof Error ? e.message : String(e)
}

export async function mapi<T = any>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, body?: Record<string, any>): Promise<T> {
  const ep = path.startsWith('/') ? path : `/db/${path}`
  try {
    return (await getClient().request(method, ep, body as JsonObject | undefined)) as T
  } catch (e) {
    throw new Error(apiErrorMessage(e))
  }
}
