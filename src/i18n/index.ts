/* i18n — 현재 언어 저장소 + t(). React 밖(액션)에서도 쓰이도록 plain 함수, 컴포넌트는 useLang() 으로 재렌더. */
import { useSyncExternalStore } from 'react'
import { en, type Dict } from './dict/en'
import { ko } from './dict/ko'
import { zhCN } from './dict/zh-CN'
import { zhTW } from './dict/zh-TW'
import { DEFAULT_LANG, LANGS, detectLang, htmlLang, normalizeLang, type Lang } from './types'

const DICTS: Record<Lang, Dict> = { ko, en, 'zh-TW': zhTW, 'zh-CN': zhCN }
const STORAGE_KEY = 'sms_lang'

/** 공유 링크의 언어 — 경로 /zh-TW/ 등(대소문자 무관) 또는 ?lang=zh-TW */
function linkLang(): Lang | null {
  try {
    const seg = location.pathname.split('/').filter(Boolean)
    const fromPath = seg.length === 1 ? LANGS.find((x) => x.toLowerCase() === seg[0].toLowerCase()) : undefined
    return fromPath ?? normalizeLang(new URLSearchParams(location.search).get('lang'))
  } catch { return null }
}

/** 주소를 현재 언어로 — 루트·언어 경로에서만(다른 경로는 건드리지 않음). ko 는 루트 유지, 그 밖은 /<lang>/.
    ?lang= 으로 들어오면 경로로 옮김. 주소창을 그대로 복사해 공유해도 지금 언어로 열리고 미리보기도 그 언어 */
export function langUrl(l: Lang, href = location.href): string {
  const u = new URL(href)
  const seg = u.pathname.split('/').filter(Boolean)
  const onLangPath = seg.length === 1 && LANGS.some((x) => x.toLowerCase() === seg[0].toLowerCase())
  if (seg.length === 0 || onLangPath) {
    u.pathname = l === DEFAULT_LANG && seg.length === 0 && !u.searchParams.has('lang') ? '/' : `/${l}/`
    u.searchParams.delete('lang') // 경로가 언어를 나타내면 ?lang= 은 중복 → 제거
  } else if (u.searchParams.has('lang')) u.searchParams.set('lang', l)
  return u.href
}
function syncUrl(l: Lang): void {
  try { const h = langUrl(l); if (h !== location.href) history.replaceState(null, '', h) } catch { /* SSR 등 */ }
}

function readInitial(): Lang {
  const fromLink = linkLang()
  if (fromLink) return fromLink // 링크 언어 > 저장값 > 브라우저
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
syncUrl(current)

export function getLang(): Lang { return current }

export function setLang(l: Lang): void {
  current = l
  try { localStorage.setItem(STORAGE_KEY, l) } catch { /* 무시 */ }
  apply()
  syncUrl(l)
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

export { LANG_DEFS, htmlLang, normalizeLang, type Lang } from './types'
export type { Dict } from './dict/en'
export type I18nKey = keyof Dict
