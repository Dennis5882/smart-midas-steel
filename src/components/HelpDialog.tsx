/* 사용안내 창 — [Manual | 릴리즈 노트] 두 탭 (story 와 같은 .rn 모달).
   Manual: 개요·준비 → 초보자 순서 → 전문가 사용 → 설계기준·단면 DB(코드 프로필에서 직접) → 판정 등급 → 범위·한계.
   릴리즈 노트: src/data/releases.json (최신 먼저), 항목 문구 = 사전 키 rn_<id>_<n>. 새 버전은 `npm run release` 로만 추가.
   열기: GUIDE·업무 메뉴 '사용 안내'(manual), 하단 바 버전·'릴리즈 노트' 명령(release) — S.help */
import { useEffect, useRef } from 'react'
import releases from '../data/releases.json'
import { CODE_IDS, profileOf, type CodeId } from '../codes'
import { GRADES } from '../domain/status'
import { t, tc, useLang, type I18nKey } from '../i18n'
import { S, notify, useStore, type HelpTab } from '../state/store'
import { APP_VERSION } from '../version'

interface Release { version: string; date: string; id: string; items: number }
const RELEASES = releases as Release[]
const SECTIONS = ['intro', 'beginner', 'expert', 'codes', 'grades', 'limits'] as const

export const openHelp = (tab: HelpTab) => { S.help = tab; notify() }
const close = () => { S.help = null; notify() }

/** 기준 하나 — 프로필 값(설계법·Gen DB·재료)과 사전 문구(기준명·관련 기준·형상)를 함께 */
function CodeTable({ code, current }: { code: CodeId; current: boolean }) {
  const p = profileOf(code)
  const mats = Object.entries(p.materials).map(([k, m]) => `${k}${m.gen ? ` (${m.gen.standard} ${m.gen.db})` : ''}`).join(', ')
  const rows: [I18nKey, string][] = [
    ['man_c_basis', t(p.basisLabelKey ?? p.labelKey)],
    ['man_c_method', p.method],
    ['man_c_refs', tc(code, 'rep_code_refs')],
    ['man_c_check', t(p.checkLabelKey ?? p.labelKey)],
    ['man_c_secdb', t(`man_db_${code}`)],
    ['man_c_mat', mats],
    ['man_c_engine', tc(code, 'src_design_why')],
  ]
  return <details className="man-code" open={current}>
    <summary><b>{code}</b> {t(p.selectLabelKey ?? p.labelKey)}{current && <span className="rn-cur">{t('man_current')}</span>}</summary>
    <table><tbody>{rows.map(([k, v]) => <tr key={k}><th>{t(k)}</th><td>{v}</td></tr>)}</tbody></table>
  </details>
}

function Manual() {
  const s = useStore()
  const body = useRef<HTMLDivElement>(null)
  const code: CodeId = s.built?.spec.code ?? s.activePlan?.spec.code ?? s.code
  const go = (k: string) => body.current?.querySelector(`#man-${k}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  return <>
    <nav className="man-nav" aria-label={t('man_tab_manual')}>{SECTIONS.map((k) => <button key={k} type="button" onClick={() => go(k)}>{t(`man_${k}`)}</button>)}</nav>
    <div className="rn-body man-body" ref={body}>
      {SECTIONS.map((k) => <section key={k} id={`man-${k}`} className="man-sec">
        <h3>{t(`man_${k}`)}</h3>
        {k === 'codes' ? <>
          <p>{t('man_codes_intro')}</p>
          {[code, ...CODE_IDS.filter((c) => c !== code)].map((c) => <CodeTable key={c} code={c} current={c === code} />)}
        </> : k === 'grades' ? <>
          <p>{t('man_grades_intro')}</p>
          <ul className="man-grades">{GRADES.map((g) => <li key={g}><span className="grade" data-g={g} style={{ marginLeft: 0 }}>{t(`gr_${g}`)}</span> {t(`gr_${g}_d`)}</li>)}</ul>
          <p>{t('src_anal')}<br />{t('src_design', t(profileOf(code).checkLabelKey ?? profileOf(code).labelKey))}</p>
        </> : <div dangerouslySetInnerHTML={{ __html: t(`man_${k}_html`) }} />}
      </section>)}
    </div>
  </>
}

function ReleaseList() {
  return <div className="rn-body">
    {RELEASES.map((r, i) => (
      <details key={r.id} className="rn-item" open={i === 0}>
        <summary>
          <span className="rn-ver">v{r.version}</span>
          {r.version === APP_VERSION && <span className="rn-cur">{t('rn_current')}</span>}
          <span className="rn-date">{r.date}</span>
        </summary>
        <div className="rn-text">
          <ul>{Array.from({ length: r.items }, (_, k) => <li key={k}>{t(`rn_${r.id}_${k + 1}` as I18nKey)}</li>)}</ul>
        </div>
      </details>
    ))}
  </div>
}

export function HelpDialog({ tab }: { tab: HelpTab }) {
  useLang() // 언어 변경 시 다시 그림
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  const tabs: [HelpTab, I18nKey][] = [['manual', 'man_tab_manual'], ['release', 'rn_title']]
  return (
    <>
      <div className="scrim on" onClick={close} />
      <div className="rn help" role="dialog" aria-modal="true" aria-label={t('man_title')}>
        <div className="rn-hd">
          <b>{t('man_title')}</b>
          <span className="rn-sub">Smart MIDAS Steel v{APP_VERSION}</span>
          <button className="rn-x" onClick={close} aria-label={t('close')}>✕</button>
        </div>
        <div className="help-tabs" role="tablist">
          {tabs.map(([id, k]) => <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => openHelp(id)}>{t(k)}</button>)}
        </div>
        {tab === 'manual' ? <Manual /> : <ReleaseList />}
      </div>
    </>
  )
}
