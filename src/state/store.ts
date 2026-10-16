/* ════════════════════════════════════════════════════════════
   STATE — story 프로젝트와 같은 mutable store.
   액션은 S 를 직접 변경한 뒤 notify() — React 는 useStore() 로 구독(version 기반 재렌더).
   MAPI-Key 는 메모리에만(저장 금지). 언어는 i18n 모듈이 따로 관리(useLang).
════════════════════════════════════════════════════════════ */
import { useSyncExternalStore } from 'react'
import { getLang, type LText } from '../i18n'
import { type CodeId } from '../codes'
import type { Results } from '../actions/results'
import type { ConnResult } from '../domain/connections'
import type { DesignResult } from '../domain/design'
import type { LoadInfo } from '../domain/loads'
import type { OptSummary } from '../domain/optimize'
import type { TemplateKey } from '../domain/templates'
import type { BuildMode } from '../agent/parse'
import { DEFAULT_SPEC, type ElementRole, type FactoryModel, type FactorySpec } from '../domain/types'

export const THEMES = ['navy', 'light', 'cyber'] as const
export type Theme = (typeof THEMES)[number]
export type PanelId = 'logP' | 'modelP' | 'viewP' | 'resP'
export type LogType = 'api' | 'ok' | 'err' | 'info' | 'warn'
export type TaskId = 'model' | 'analysis' | 'design' | 'optimize' | 'outputs' | 'history'
export interface Activity {
  id: number; at: number; source: 'job' | 'notice' | 'artifact'; level: 'info' | 'warn' | 'error'
  html?: string | LText; kind?: JobKind; parent?: number; acknowledged?: boolean
  status?: 'running' | 'done' | 'failed' | 'cancelled'; elapsed?: number
  name?: string; revision?: number; resultRevision?: number; code?: CodeId
}
export type CamId = 'iso' | 'front' | 'side' | 'top'
/** 3D 표시 토글 — 주골조(기둥·지붕보)·2차부재(퍼린·거트·스트럿·풍주)·가새·지점 */
export type Vis3D = Record<ElementRole | 'support' | 'node', boolean>

export interface LogEntry { id: number; ts: string; type: LogType; html: string }

/** 채팅 메시지 — html(일반) / plan(공장 스펙 편집 카드) / thinking(대기 표시). ts = 표시용 시각(HH:MM) */
export type ChatMsg = { ts?: string } & (
  | { id: number; role: 'user' | 'bot'; kind: 'html'; html: string | LText }
  | { id: number; role: 'bot'; kind: 'thinking' }
  | { id: number; role: 'bot'; kind: 'plan'; spec: FactorySpec; epoch: number; mode: BuildMode; tpl?: TemplateKey; modelRevision?: number }
)

/** Gen 에 보낸 모델 — 스펙·형상·하중 요약 */
/** sent = Gen 에 보낸 페이로드(DB → Assign) — 해석·검토 직전 Gen 동일성 비교(actions/genSync) */
export interface Built { spec: FactorySpec; model: FactoryModel; info: LoadInfo; cases: string[]; combos: number; comboNames: string[]; sent?: Record<string, Record<string, unknown>> }

/** 진행 중 작업 — stage = 문구 키, step/total = 이 단계 MAPI 호출 수, iter = 최적화 반복 [n, 최대] */
export type JobKind = 'build' | 'anal' | 'design' | 'opt' | 'pdf' | 'restore'
export interface Job { kind: JobKind; stage: string; step: number; total: number; detail: string; t0: number; cancel: boolean; iter?: [number, number]; activityId?: number }

/** 반력 합계 (하중 케이스별) */
export interface ReactionSum { lc: string; fx: number; fy: number; fz: number }

function readTheme(): Theme {
  try {
    const t = localStorage.getItem('sms_theme')
    if ((THEMES as readonly string[]).includes(t ?? '')) return t as Theme
  } catch { /* storage 차단 */ }
  return 'light'
}

function readCode(): CodeId {
  return getLang() === 'zh-CN' ? 'CN' : 'TW'
}

export const S = {
  /* MIDAS API — MAPI-Key 는 메모리에만(저장 금지) */
  baseUrl: 'https://moa-engineers.midasit.com:443/gen',
  mapiKey: '',
  /** 자동 저장 폴더 (Gen NX 실행 PC 기준) — 확인 창 방지용 */
  saveDir: 'C:/temp',
  connected: false,
  connErr: false,
  program: '',
  apiUser: '',
  busy: false,
  /** 진행 중 작업 (진행 표시·취소) — busy 와 함께 beginJob/endJob 이 관리 */
  job: null as Job | null,
  /** 마지막 작업 실패·취소 (작업 흐름 띠의 다시 시도) — beginJob 이 비움 */
  lastFail: null as { kind: JobKind; cancelled: boolean; msg?: string } | null,
  /** Gen 모델 변경 감지 건수 (0 = 같음) — assertGenSync 가 갱신, sendModel 이 비움 */
  genChanged: 0,
  /** 확인 창 요청 (ConfirmDialog) */
  confirm: null as (import('../components/ConfirmDialog').ConfirmReq & { resolve(ok: boolean): void }) | null,
  /** 마지막 [공장 생성] 직전 Gen 문서 백업 (Gen PC 경로) — [이전 모델로 복원] 대상 */
  restorePoint: null as string | null,
  theme: readTheme(),
  code: readCode(),
  panel: 'logP' as PanelId,
  cam: 'iso' as CamId,
  vis3d: { column: true, rafter: true, purlin: true, girt: true, strut: true, post: true, brace: true, support: true, node: false } as Vis3D,
  /** 3D 표시 방식 — 선 / 단면 형상(실제 치수 입체) */
  render3d: 'line' as 'line' | 'solid',
  /** 3D 를 강도비 색상으로 표시 */
  ratioView: false,
  log: [] as LogEntry[],
  msgs: [] as ChatMsg[],
  /** One current modeling editor. Hidden on the start screen, kept mounted to retain raw inputs and step. */
  activePlan: null as Extract<ChatMsg, { kind: 'plan' }> | null,
  draftSpec: null as FactorySpec | null,
  workspaceView: 'start' as 'start' | 'model',
  task: 'model' as TaskId,
  draftInvalid: false,
  modelRevision: 0,
  resultRevision: 0,
  activity: [] as Activity[],
  /** 실행되면 증가 — 이전 계획 카드의 버튼을 모두 잠근다 */
  buildEpoch: 0,
  /** 편집 중인 스펙 미리보기 (아직 Gen 에 보내지 않은 형상) */
  preview: null as FactorySpec | null,
  viewNonce: 0,
  built: null as Built | null,
  analyzed: false,
  reactions: null as ReactionSum[] | null,
  /** 해석 결과 원자료 (설계 검토 입력) */
  results: null as Results | null,
  design: null as DesignResult | null,
  connections: null as ConnResult[] | null,
  /** 릴리즈 노트 창 열림 */
  rnOpen: false,
  /** 단면 자동 최적화 결과 */
  opt: null as OptSummary | null,
  /** 마지막으로 쓴 스펙 — 새 계획 카드의 출발점 */
  lastSpec: DEFAULT_SPEC as FactorySpec,
}
export type AppState = typeof S

let version = 0
let idSeq = 0
const listeners = new Set<() => void>()

export function nextId(): number { return ++idSeq }

export function notify(): void {
  version++
  listeners.forEach((f) => f())
}

/** 컴포넌트 구독 — version 이 바뀔 때마다 재렌더하고 S 를 그대로 돌려준다 */
export function useStore(): AppState {
  useSyncExternalStore((f) => { listeners.add(f); return () => listeners.delete(f) }, () => version)
  return S
}
