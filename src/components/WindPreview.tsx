/* 하중 입력 단계 — 실제로 Gen 에 넣는 풍하중 미리보기 (케이스별 풍향·내압·수평 합력·지붕 상향력).
   입력 칸만 보면 '기본 풍하중만 넣는다'고 오해하기 쉬워, 면별 외압·내압 케이스가 실제로 들어간다는 것을 보여 준다 */
import { useEffect, useState } from 'react'
import { buildLoadPayloads } from '../domain/loads'
import { buildPortal } from '../domain/portal'
import type { FactorySpec } from '../domain/types'
import { windSummary, type WindRow, type WindSummary } from '../domain/windSummary'
import { t } from '../i18n'

/** 음수는 수학 기호 − (내압 칸과 같은 표기) */
const fmt = (v: number, d = 1) => (Math.abs(v) < 0.5 * 10 ** -d ? '0' : `${v < 0 ? '−' : ''}${Math.abs(v).toFixed(d)}`)

/** 입력이 멈춘 뒤 계산 (모델·전체 하중을 다시 만들므로 — 3D 미리보기와 같은 지연) */
const DEBOUNCE_MS = 250

/** 풍 입력 묶음 아래 — 개구부 안내 + 미리보기 (기본 모델링·자유골조 공통) */
export function WindLoadInfo({ spec }: { spec: FactorySpec }) {
  return <>
    {spec.code === 'TW' && <div className="pe-tip">{t('wp_opening_tip')}</div>}
    {spec.code === 'KR' && <div className="pe-tip">{t('wp_opening_tip_KR', t('f_kr_cpi'), t('cpi_dominant1'), t('cpi_dominant2'))}</div>}
    <WindPreview spec={spec} />
  </>
}

type Computed = { ok: true; sum: WindSummary } | { ok: false }

export function WindPreview({ spec }: { spec: FactorySpec }) {
  /* spec 은 편집기에서 입력이 바뀔 때만 새 객체 (useMemo) */
  const [res, setRes] = useState<Computed | null>(null)
  useEffect(() => {
    const h = setTimeout(() => {
      try { const model = buildPortal(spec); setRes({ ok: true, sum: windSummary(model, buildLoadPayloads(spec, model)) }) }
      catch { setRes({ ok: false }) }
    }, DEBOUNCE_MS)
    return () => clearTimeout(h)
  }, [spec])
  if (!res) return null
  /* 계산 실패(입력 오류·추가 구조 미확인 등)는 조용히 숨기지 않고 이유를 알린다 — 풍하중이 빠진 것으로 오해하지 않게 */
  if (!res.ok) return <p className="mw-note wind-preview">{t('wp_unavailable')}</p>
  const sum = res.sum
  if (!sum.rows.length) return null
  const cn = spec.code === 'CN'
  const internal = (r: WindRow) => (r.gcpi === null ? '—' : cn ? (r.gcpi > 0 ? '+i' : '−i') : `${r.gcpi > 0 ? '+' : r.gcpi < 0 ? '−' : ''}${+Math.abs(r.gcpi).toFixed(3)}`)
  return <details className="mw-advanced wind-preview" open>
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
  </details>
}
