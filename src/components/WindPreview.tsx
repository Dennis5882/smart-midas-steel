/* 하중 입력 단계 — 실제로 Gen 에 넣는 풍하중 미리보기 (케이스별 풍향·내압·수평 합력·지붕 상향력).
   입력 칸만 보면 '기본 풍하중만 넣는다'고 오해하기 쉬워, 면별 외압·내압 케이스가 실제로 들어간다는 것을 보여 준다 */
import { useEffect, useRef, useState } from 'react'
import { buildLoadPayloads } from '../domain/loads'
import { buildPortal } from '../domain/portal'
import type { FactorySpec } from '../domain/types'
import type { WindProfile } from '../domain/loads'
import { windSummary, type WindRow, type WindSummary } from '../domain/windSummary'
import { t } from '../i18n'
import { PREVIEW_DEBOUNCE_MS } from './modelingFlow'

/** 음수는 수학 기호 − (내압 칸과 같은 표기) */
const fmt = (v: number, d = 1) => (Math.abs(v) < 0.5 * 10 ** -d ? '0' : `${v < 0 ? '−' : ''}${Math.abs(v).toFixed(d)}`)

/** 풍 입력 묶음 아래 — 개구부 안내 + 미리보기 (기본 모델링·자유골조 공통) */
export function WindLoadInfo({ spec }: { spec: FactorySpec }) {
  return <>
    {spec.code === 'TW' && <div className="pe-tip">{t('wp_opening_tip')}</div>}
    {spec.code === 'KR' && <div className="pe-tip">{t('wp_opening_tip_KR', t('f_kr_cpi'), t('cpi_dominant1'), t('cpi_dominant2'))}</div>}
    <WindPreview spec={spec} />
  </>
}

/** 계산 결과와 그 계산에 쓴 스펙 — 표 형식(CN ±i 등)은 계산한 스펙 기준 */
/** 높이별 풍압 — 풍상벽은 높이마다 q(z), 나머지 면은 q(h) 하나 ('높이별 편차가 반영되나' 현지 질문, 2026-10-21) */
function WindProfileTable({ p }: { p: WindProfile }) {
  return <>
    <h5 className="wp-sub">{t('wp_prof_title')}</h5>
    <table className="wp-table">
      <thead><tr><th>{t('wp_prof_z')}</th><th>{t('wp_prof_qz')}</th><th>{t('wp_prof_ww', +p.gust.toFixed(3) + '', +p.windwardCp.toFixed(2) + '')}</th></tr></thead>
      <tbody>{[...p.rows].reverse().map((r) => <tr key={r.z}><td className="mono">{r.z.toFixed(2)}</td><td className="mono">{r.qz.toFixed(3)}</td><td className="mono">{fmt(r.windward, 3)}</td></tr>)}</tbody>
    </table>
    <p className="mw-note mono">{t('wp_prof_const', fmt(p.leewardX, 3), fmt(p.leewardY, 3), fmt(p.side, 3), p.internal.toFixed(3))}</p>
    <p className="mw-note">{t('wp_prof_note')} {t(p.kzt === 1 ? 'wp_kzt_flat' : 'wp_kzt_user', +p.kzt.toFixed(3) + '')}</p>
  </>
}

type Computed = { spec: FactorySpec; sum: WindSummary | null }
const compute = (spec: FactorySpec): Computed => {
  try { const model = buildPortal(spec); return { spec, sum: windSummary(model, buildLoadPayloads(spec, model)) } }
  catch { return { spec, sum: null } }
}

/* spec 은 편집기에서 입력이 바뀔 때만 새 객체(useMemo) — 같은 스펙으로 다시 그리면(단계 이동) 계산 없이 바로 표시 */
const cache = new WeakMap<FactorySpec, Computed>()
/** 휠·방향키로 계속 바꾸는 중에도 이 간격마다 한 번은 갱신 (지연만 하면 손을 뗄 때까지 옛 값) */
const MAX_STALE_MS = 600

export function WindPreview({ spec }: { spec: FactorySpec }) {
  const [res, setRes] = useState<Computed | null>(() => cache.get(spec) ?? null)
  const staleSince = useRef<number | null>(null)
  useEffect(() => {
    if (res?.spec === spec) { staleSince.current = null; return }
    /* 처음 계산은 다음 차례로 미뤄 편집기를 먼저 그리고, 이후 변경은 지연(최대 MAX_STALE_MS) 계산 */
    const now = performance.now()
    staleSince.current ??= now
    const delay = res ? Math.max(0, Math.min(PREVIEW_DEBOUNCE_MS, staleSince.current + MAX_STALE_MS - now)) : 0
    const h = setTimeout(() => {
      const c = cache.get(spec) ?? compute(spec)
      cache.set(spec, c); setRes(c)
    }, delay)
    return () => clearTimeout(h)
  }, [spec, res])
  if (!res) return <p className="mw-note wind-preview" aria-busy>{t('wp_calculating')}</p>
  /* 다시 계산하기 전까지 이전 결과는 흐리게 — 현재 입력의 값이 아님 */
  const stale = res.spec !== spec
  /* 계산 실패(입력 오류·추가 구조 미확인 등)는 조용히 숨기지 않고 이유를 알린다 — 풍하중이 빠진 것으로 오해하지 않게 */
  if (!res.sum) return <p className={`mw-note wind-preview${stale ? ' stale' : ''}`} aria-busy={stale || undefined}>{t('wp_unavailable')}</p>
  const sum = res.sum
  if (!sum.rows.length) return null
  const cn = res.spec.code === 'CN'
  const internal = (r: WindRow) => (r.gcpi === null ? '—' : cn ? (r.gcpi > 0 ? '+i' : '−i') : `${r.gcpi > 0 ? '+' : r.gcpi < 0 ? '−' : ''}${+Math.abs(r.gcpi).toFixed(3)}`)
  return <details className={`mw-advanced wind-preview${stale ? ' stale' : ''}`} open aria-busy={stale || undefined}>
    <summary>{t('wp_title', sum.rows.length)}</summary>
    <p className="mw-note">{t('wp_desc')}</p>
    {!cn && <p className="mw-note mono">{t('wp_qh', sum.qh.toFixed(3), sum.hRef.toFixed(1))}</p>}
    <table className="wp-table">
      <thead><tr><th>{t('wp_case')}</th><th>{t('wp_dir')}</th><th>{t('wp_internal')}</th><th>{t('wp_roofcp')}</th><th>{t('wp_horiz')}</th><th>{t('wp_uplift')}</th></tr></thead>
      <tbody>{sum.rows.map((r) => <tr key={r.name}>
        <td className="mono">{r.name}</td>
        <td>{r.kind === 'torsion' ? t('wp_torsion') : r.kind === 'across' ? `${r.dir!.replace('-', '−')} · ${t('wp_across')}` : r.dir!.replace('-', '−')}</td>
        <td className="mono">{internal(r)}</td>
        <td className="mono">{r.roofCp === null ? '—' : fmt(r.roofCp, 2)}</td>
        <td className="mono">{r.kind === 'torsion' ? '—' : fmt(r.horizontal)}</td>
        <td className="mono">{r.kind === 'main' ? fmt(r.uplift) : '—'}</td>
      </tr>)}</tbody>
    </table>
    <p className="mw-note">{t('wp_axes')}</p>
    {sum.profile && <WindProfileTable p={sum.profile} />}
  </details>
}
