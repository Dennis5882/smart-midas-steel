/* 세션 — 채팅 입력 처리, 설정(테마·기준), 연결 테스트, 입력창 제어 */
import { fetchReactions, runAnalysis } from '../actions/analysis'
import { runDesignCheck } from '../actions/design'
import { downloadDrawings, openReport } from '../actions/outputs'
import type { CodeId } from '../codes'
import { DEFAULT_SPEC, type FactorySpec } from '../domain/types'
import { t } from '../i18n'
import { verifyConn } from '../mapi/client'
import { S, notify, type Theme } from '../state/store'
import { addMsg, addPlanMsg, escapeHtml, previewSpec, tab } from '../state/ui'
import { parseCommand } from './parse'

/** 사용자 입력 1건 처리 (로컬 명령) */
export async function send(raw: string): Promise<void> {
  const txt = raw.trim()
  if (!txt) return
  addMsg('user', escapeHtml(txt))
  const c = parseCommand(txt)
  switch (c.intent) {
    case 'help': addMsg('bot', t('help_html')); break
    case 'clear': clearChat(); break
    case 'new': {
      const spec: FactorySpec = { ...DEFAULT_SPEC, ...S.lastSpec, ...c.params, code: S.code }
      addPlanMsg(spec)
      tab('viewP')
      previewSpec(spec)
      break
    }
    case 'analyze': await runAnalysis(); break
    case 'design': await runDesignCheck(); break
    case 'report': openReport(); break
    case 'drawings': downloadDrawings(); break
    case 'reactions': {
      if (!S.built) { addMsg('bot', t('no_model')); break }
      if (!S.analyzed) { addMsg('bot', t('need_anal')); break }
      await fetchReactions()
      addMsg('bot', t('react_done'))
      tab('resP')
      break
    }
    case 'status': {
      const b = S.built
      addMsg('bot', b
        ? t('status_html', b.spec.span, b.spec.bays * b.spec.baySpacing, b.spec.eaveHeight, b.model.nodes.length, b.model.elements.length, S.analyzed)
        : t('status_none'))
      break
    }
    case 'conn': {
      const r = await testConn()
      addMsg('bot', r.cls === 'ok' ? t('conn_ok', S.program || 'gen') : escapeHtml(r.text))
      break
    }
    default: addMsg('bot', t('unknown', escapeHtml(txt)))
  }
}

export function clearChat(): void {
  S.msgs = []
  addMsg('bot', t('cleared'))
}

export function setTheme(th: Theme): void {
  S.theme = th
  document.documentElement.dataset.theme = th
  try { localStorage.setItem('sms_theme', th) } catch { /* 무시 */ }
  S.viewNonce++ // 3D 색 = 테마 토큰 → 재플롯
  notify()
}

/** 설계기준 — 이후 새로 만드는 스펙에 적용 */
export function setCode(id: CodeId): void {
  S.code = id
  try { localStorage.setItem('sms_code', id) } catch { /* 무시 */ }
  notify()
}

export interface TestOut { cls: '' | 'ok' | 'err'; text: string }

export async function testConn(): Promise<TestOut> {
  const fail = (): void => { S.connected = false; S.connErr = true; notify() }
  if (!S.baseUrl.trim() || !S.mapiKey.trim()) return { cls: 'err', text: t('test_need') }
  try {
    const { ok, status, j } = await verifyConn()
    if (!ok) { fail(); return { cls: 'err', text: status === 401 || status === 403 ? `${t('test_keyfail')}\n(HTTP ${status})` : t('test_http', status) } }
    if (!(j && j.status === 'connected' && j.keyVerified !== false)) {
      fail()
      return { cls: 'err', text: `${t('test_keyfail')}\n(status: ${j?.status ?? '-'} · keyVerified: ${j?.keyVerified ?? '-'})` }
    }
    S.connected = true; S.connErr = false
    S.program = (j.program || '').toLowerCase(); S.apiUser = j.user || ''
    notify()
    if (S.program && S.program !== 'gen') return { cls: 'err', text: t('test_wrongprod', j.program ?? '') }
    return { cls: 'ok', text: t('test_ok', j.program || 'gen', j.user || '') }
  } catch (e) {
    fail()
    return { cls: 'err', text: t('test_err', e instanceof Error ? e.message : String(e)) }
  }
}

/* ── 입력창 제어 (가이드 패널용) — Composer 가 등록 ── */
let composerRun: ((txt: string) => Promise<void>) | null = null
export function registerComposer(run: ((txt: string) => Promise<void>) | null): void { composerRun = run }
export function runCmd(txt: string): Promise<void> { return composerRun ? composerRun(txt) : send(txt) }
