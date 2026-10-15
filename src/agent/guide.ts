/* GUIDE 패널 구조 — 문구는 사전: 섹션 g_<id>, 항목 g_<id>_<n>(라벨)·g_<id>_<n>_cmd(명령), 안내 g_<id>_note.
   클릭 = 명령을 입력창에 타이핑해 보여준 뒤 바로 실행(채팅 입력과 같은 경로) — story 와 같은 방식. */
import type { I18nKey } from '../i18n'

/* 키 타입: 사전에 실제로 있는 g_* 키만 허용 — 항목 키 K 는 `${K}_cmd` 도 사전에 있어야 함 */
type CmdBase<K = I18nKey> = K extends `${infer B}_cmd` ? B : never
export type GuideItemKey = Extract<CmdBase, I18nKey>
export type GuideSecId = I18nKey extends infer K ? (K extends `g_${infer Id}` ? (Id extends `${string}_${string}` ? never : Id) : never) : never

export type GuideItem =
  | { div: true }
  | { note: Extract<I18nKey, `g_${string}_note`> }
  | { icon: string; key: GuideItemKey }

/** acc = 섹션 강조색(app.css .gsec[data-acc]) */
export interface GuideSection { id: GuideSecId; icon: string; acc: 'cyan' | 'blue' | 'amber' | 'green' | 'violet'; open: boolean; items: GuideItem[] }

export const GUIDE: GuideSection[] = [
  { id: 'model', acc: 'cyan', icon: '⊞', open: true, items: [
    { icon: '⌂', key: 'g_model_1' },
    { icon: '↔', key: 'g_model_2' },
    { icon: '⋯', key: 'g_model_3' },
    { note: 'g_model_note' },
  ] },
  { id: 'analysis', acc: 'green', icon: '∑', open: true, items: [
    { icon: '▶', key: 'g_analysis_1' },
  ] },
  { id: 'result', acc: 'amber', icon: '▤', open: true, items: [
    { icon: '⊥', key: 'g_result_1' },
  ] },
  { id: 'design', acc: 'blue', icon: '◫', open: true, items: [
    { icon: '✓', key: 'g_design_1' },
    { icon: '▦', key: 'g_design_2' },
    { icon: '⌗', key: 'g_design_3' },
    { icon: '⚖', key: 'g_design_4' },
    { note: 'g_design_note' },
  ] },
  { id: 'misc', acc: 'violet', icon: '⊟', open: false, items: [
    { icon: '◎', key: 'g_misc_1' },
    { icon: '◈', key: 'g_misc_2' },
    { icon: '⧉', key: 'g_misc_4' },
    { div: true },
    { icon: '↺', key: 'g_misc_3' },
  ] },
  { id: 'help', acc: 'cyan', icon: '?', open: false, items: [
    { icon: '≡', key: 'g_help_1' },
    { icon: '✎', key: 'g_help_2' },
  ] },
]
