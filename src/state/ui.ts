/* UI 헬퍼 — 로그·채팅 메시지·탭·3D 미리보기 (story state/ui.ts 와 같은 역할) */
import type { BuildMode } from '../agent/parse'
import type { TemplateKey } from '../domain/templates'
import type { FactorySpec } from '../domain/types'
import { render, type LText } from '../i18n'
import { S, nextId, notify, type LogType, type PanelId } from './store'

const nowTs = () => new Date().toTimeString().slice(0, 8)
const hm = () => new Date().toTimeString().slice(0, 5)

export function escapeHtml(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!)
}

/** 활동 로그. err 는 이스케이프, 나머지는 HTML 허용 */
export function log(msg: string, type: LogType = 'api'): void {
  S.log.push({ id: nextId(), ts: nowTs(), type, html: type === 'err' ? escapeHtml(msg) : msg })
  notify()
}

/** html = 문자열(지금 언어로 확정) 또는 lt()/ltc() (그릴 때 번역 — 언어 변경 시 지난 메시지도 바뀜) */
export function addMsg(role: 'user' | 'bot', html: string | LText): void {
  S.msgs.push({ id: nextId(), ts: hm(), role, kind: 'html', html })
  notify()
}

/** 공장 스펙 카드 — template: 요약 카드(수정 → 편집) / free: 자유골조 편집 카드 */
export function addPlanMsg(spec: FactorySpec, mode: BuildMode = 'free', tpl?: TemplateKey): void {
  S.msgs.push({ id: nextId(), ts: hm(), role: 'bot', kind: 'plan', spec, epoch: S.buildEpoch, mode, tpl })
  notify()
}

/** 대기 표시 — remove() 로 제거 */
export function thinking(): { remove(): void } {
  const id = nextId()
  S.msgs.push({ id, role: 'bot', kind: 'thinking' })
  notify()
  return {
    remove() {
      const i = S.msgs.findIndex((m) => m.id === id)
      if (i >= 0) { S.msgs.splice(i, 1); notify() }
    },
  }
}

export function tab(id: PanelId): void { S.panel = id; notify() }

/** 현재(Gen 에 보낸) 모델로 3D 재플롯 — 미리보기 해제 */
export function draw3D(): void { S.preview = null; S.viewNonce++; notify() }

/** 스펙 미리보기 (아직 Gen 에 보내지 않은 형상) */
export function previewSpec(p: FactorySpec): void { S.preview = p; S.viewNonce++; notify() }

/** 메시지 본문을 현재 언어 문자열로 (테스트·스크립트용) */
export const msgText = (m: { kind: string; html?: string | LText }): string => (m.kind === 'html' && m.html !== undefined ? render(m.html) : '')
