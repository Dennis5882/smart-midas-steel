/* MAPI — midas-nx SDK(MidasClient) 래퍼. 브라우저가 로컬 MIDAS Gen 에 직접 호출한다.
   path 가 '/' 로 시작하면 그대로, 아니면 /db/{path}. 호출·실패는 활동 로그에 남긴다. */
import { MidasAPIError, MidasClient, MidasConnectionError, unwrapTable, type JsonObject } from 'midas-nx'
import { t } from '../i18n'
import { S } from '../state/store'
import { log } from '../state/ui'
import { jobCall } from '../actions/job'

/* 요청별 대기 한도 (대기만 중단 — Gen 이 받은 작업은 취소되지 않는다, SDK 안내).
   해석·결과 표는 수 분 걸릴 수 있어 길게(TW 박공 BEAMFORCE 155 조합 ≈ 105 s), 문서 저장·열기는 중간,
   나머지(db 조회·전송, 화면)는 짧게 — Gen 에 대화상자가 떠 /db 호출이 막히면 15분 대신 1분 안에 실패를 알린다 */
export const TIMEOUTS = { long: 15 * 60 * 1000, doc: 3 * 60 * 1000, short: 60 * 1000 } as const
export function timeoutFor(endpoint: string): number {
  if (endpoint === '/doc/anal' || endpoint === '/post/TABLE') return TIMEOUTS.long
  if (endpoint.startsWith('/doc/')) return TIMEOUTS.doc
  return TIMEOUTS.short
}

/** 결과 표 본문 — 응답 최상위 키(요청한 TABLE_NAME·'Result Table'·'empty' 등, 라이브 Gen 마다 다름)에 기대지 않고
    HEAD/DATA 모양으로 찾는다(SDK unwrapTable). 합계만 있는 표(SUB_TABLES)도 찾는다. 없으면 {} */
export function tableOf(response: unknown): any {
  if (!response || typeof response !== 'object' || Array.isArray(response)) return {}
  const t = unwrapTable(response as JsonObject)
  if (Object.keys(t).length) return t
  return Object.values(response).find((v) => v && typeof v === 'object' && !Array.isArray(v) && 'SUB_TABLES' in v) ?? {}
}

let cached: { key: string; base: string; client: MidasClient } | null = null

export function getClient(): MidasClient {
  const base = S.baseUrl.trim().replace(/\/$/, '')
  const key = S.mapiKey.trim()
  if (!cached || cached.key !== key || cached.base !== base) {
    cached = { key, base, client: new MidasClient({ mapiKey: key, baseUrl: base, product: 'gen', timeout: TIMEOUTS.short }) }
  }
  return cached.client
}

export function apiErrorMessage(e: unknown, endpoint = ''): string {
  /* 대기 한도 초과 — SDK 는 MidasConnectionError('… failed', cause: 'Timed out after Nms') 로 알린다 (2.10.2) */
  if (e instanceof MidasConnectionError) {
    const m = /Timed out after (\d+)ms/.exec(String((e as { cause?: unknown }).cause instanceof Error ? ((e as { cause?: Error }).cause!.message) : (e as { cause?: unknown }).cause ?? ''))
    if (m) return t('gen_timeout', Math.round(+m[1] / 1000), endpoint || e.message.replace(/ failed$/, ''))
  }
  if (e instanceof MidasAPIError) {
    const body = e.responseBody as any
    const m = body?.error?.message ?? (typeof body?.error === 'string' ? body.error : undefined) ?? body?.message
    if (m) return String(m)
    if (e.statusCode) return `HTTP ${e.statusCode}`
  }
  return e instanceof Error ? e.message : String(e)
}

export async function mapi<T = any>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, body?: Record<string, any>, note = ''): Promise<T> {
  const ep = path.startsWith('/') ? path : `/db/${path}`
  jobCall(`${method} ${ep}`) // 취소됐으면 여기서 Cancelled — 보내기 전에 멈춘다
  log(`<span style="color:var(--blue)">${method}</span> ${ep}${note ? ` <span style="color:var(--dim)">· ${note}</span>` : ''}`, 'api')
  try {
    return (await getClient().request(method, ep, body as JsonObject | undefined, { timeout: timeoutFor(ep) })) as T
  } catch (e) {
    const m = apiErrorMessage(e, `${method} ${ep}`)
    log(`${method} ${ep} — ${m}`, 'err')
    throw new Error(m)
  }
}

export interface VerifyResult {
  ok: boolean
  status: number
  j: { status?: string; keyVerified?: boolean; program?: string; user?: string }
}

/** /mapikey/verify — 실패해도 throw 하지 않고 상태를 돌려준다 */
export async function verifyConn(): Promise<VerifyResult> {
  try {
    const j = (await getClient().verifyConnection()) as VerifyResult['j']
    return { ok: true, status: 200, j }
  } catch (e) {
    if (e instanceof MidasAPIError && e.statusCode) return { ok: false, status: e.statusCode, j: (e.responseBody as any) ?? {} }
    throw e
  }
}
