/* 세션 — 채팅 입력 처리, 설정(테마·기준), 연결 테스트, 입력창 제어 */
import { fetchReactions, runAnalysis } from '../actions/analysis'
import { runDesignCheck } from '../actions/design'
import { runOptimize } from '../actions/optimize'
import { downloadDrawings, downloadQuantities, openReport, printReport } from '../actions/outputs'
import type { CodeId } from '../codes'
import { portalGeometry } from '../domain/portal'
import { TEMPLATES } from '../domain/templates'
import { defaultSpecFor, normalizeBays, type FactorySpec } from '../domain/types'
import { getLang, langUrl, t } from '../i18n'
import { verifyConn } from '../mapi/client'
import { S, notify, type Theme } from '../state/store'
import { addMsg, addPlanMsg, escapeHtml, previewSpec, tab } from '../state/ui'
import { parseCommand } from './parse'

const BUSY_BLOCKED = new Set<string>(['analyze', 'design', 'optimize', 'report', 'drawings', 'pdf', 'quantities', 'reactions', 'conn'])

/** 사용자 입력 1건 처리 (로컬 명령) */
export async function send(raw: string): Promise<void> {
  const txt = raw.trim()
  if (!txt) return
  addMsg('user', escapeHtml(txt))
  const c = parseCommand(txt)
  /* 작업 중에는 Gen 호출·결과를 쓰는 명령을 막는다 (결과가 바뀌는 중이라 출력도 막음). 도움말·스펙 카드·상태는 허용 */
  if (S.busy && BUSY_BLOCKED.has(c.intent)) { addMsg('bot', t('busy')); return }
  switch (c.intent) {
    case 'help': addMsg('bot', t('help_html')); break
    case 'clear': clearChat(); break
    case 'release_notes': S.rnOpen = true; notify(); break
    case 'copy_link': {
      const u = langUrl(getLang())
      try { await navigator.clipboard.writeText(u); addMsg('bot', t('link_copied', escapeHtml(u))) }
      catch { addMsg('bot', t('link_copy_fail', escapeHtml(u))) }
      break
    }
    case 'new': {
      /* 지역·하중·단면 = 기준 기본값 + 직전 입력. 기본 모델링은 형상을 템플릿으로 덮고 베이 목록을 지운다 */
      const base: FactorySpec = { ...defaultSpecFor(S.code), ...(S.lastSpec.code === S.code ? S.lastSpec : {}) }
      const geo = c.mode === 'template' ? { ...TEMPLATES[c.tpl ?? 'general'], bayList: undefined } : {}
      const spec = normalizeBays({ ...base, ...geo, ...c.params, code: S.code })
      addPlanMsg(spec, c.mode, c.tpl)
      tab('viewP')
      previewSpec(spec)
      break
    }
    case 'analyze': await runAnalysis(); break
    case 'design': await runDesignCheck(); break
    case 'optimize': await runOptimize(); break
    case 'report': openReport(); break
    case 'drawings': downloadDrawings(); break
    case 'pdf': printReport(); break
    case 'quantities': downloadQuantities(); break
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
        ? t('status_html', b.spec.span, portalGeometry(b.spec).length, b.spec.eaveHeight, b.model.nodes.length, b.model.elements.length, S.analyzed)
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
  if (S.code !== id) S.buildEpoch++
  S.code = id
  if (S.lastSpec.code !== id) S.lastSpec = defaultSpecFor(id)
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
