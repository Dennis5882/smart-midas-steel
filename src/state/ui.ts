/* UI 헬퍼 — 로그·채팅 메시지·탭·3D 미리보기 (story state/ui.ts 와 같은 역할) */
import type { FactorySpec } from '../domain/types'
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

export function addMsg(role: 'user' | 'bot', html: string): void {
  S.msgs.push({ id: nextId(), ts: hm(), role, kind: 'html', html })
  notify()
}

/** 공장 스펙 편집 카드 */
export function addPlanMsg(spec: FactorySpec): void {
  S.msgs.push({ id: nextId(), ts: hm(), role: 'bot', kind: 'plan', spec, epoch: S.buildEpoch })
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
