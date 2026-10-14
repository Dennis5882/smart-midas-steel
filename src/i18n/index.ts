/* i18n — 현재 언어 저장소 + t(). React 밖(액션)에서도 쓰이도록 plain 함수, 컴포넌트는 useLang() 으로 재렌더. */
import { useSyncExternalStore } from 'react'
import { en, type Dict } from './dict/en'
import { ko } from './dict/ko'
import { zhCN } from './dict/zh-CN'
import { zhTW } from './dict/zh-TW'
import { DEFAULT_LANG, detectLang, htmlLang, normalizeLang, type Lang } from './types'

const DICTS: Record<Lang, Dict> = { ko, en, 'zh-TW': zhTW, 'zh-CN': zhCN }
const STORAGE_KEY = 'sms_lang'

function readInitial(): Lang {
  try {
    const saved = normalizeLang(localStorage.getItem(STORAGE_KEY))
    if (saved) return saved
  } catch { /* 저장소 접근 불가 */ }
  return detectLang(navigator.languages) ?? DEFAULT_LANG
}

let current: Lang = readInitial()
const listeners = new Set<() => void>()
const apply = () => { document.documentElement.lang = htmlLang(current) }
apply()

export function getLang(): Lang { return current }

export function setLang(l: Lang): void {
  current = l
  try { localStorage.setItem(STORAGE_KEY, l) } catch { /* 무시 */ }
  apply()
  listeners.forEach((f) => f())
}

export function useLang(): Lang {
  return useSyncExternalStore((f) => { listeners.add(f); return () => listeners.delete(f) }, getLang)
}

/** UI 문자열. 현재 언어 → en 폴백, 함수값이면 인자 적용 */
export function t<K extends keyof Dict>(key: K, ...args: Dict[K] extends (...a: infer A) => string ? A : []): string {
  const v = (DICTS[current][key] ?? en[key]) as string | ((...a: unknown[]) => string)
  return typeof v === 'function' ? v(...args) : v
}

export { LANG_DEFS, normalizeLang, type Lang } from './types'
export type { Dict } from './dict/en'
