/* 결과 탭 — 대만 독립기초 예비검토 (建築物基礎構造設計規範). 입력을 바꾸면 Gen 재해석 없이 재계산 */
import { t, type I18nKey } from '../i18n'
import { S, notify, useStore } from '../state/store'
import { footingState } from '../state/footing'
import { footingInputError, type FootingInput } from '../domain/twFoundation'
import { AdditionNumber } from './AdditionEditor'

const FIELDS: [keyof FootingInput, string][] = [['qa', 'kN/m²'], ['depth', 'm'], ['thickness', 'm'], ['friction', ''], ['soilGamma', 'kN/m³'], ['concreteGamma', 'kN/m³']]
const color = (r: number) => r > 1 ? 'var(--red)' : r > .9 ? 'var(--amber)' : 'var(--green)'

export function FootingCard() {
  const s = useStore(), st = footingState()
  if (st.kind === 'none') return null
  const f = s.footingInput, bad = footingInputError(f)
  const set = (patch: Partial<FootingInput>) => { S.footingInput = { ...f, confirmed: false, ...patch }; notify() }
  return (
    <div className="scard"><h3>{t('ft_title')}</h3>
      <p className="mw-note">{t('ft_note')}</p>
      {st.kind === 'additions' && <p className="mw-note" role="note">{t('ft_additions')}</p>}
      {st.kind === 'unavailable' && <p className="mw-note" role="note">{t('ft_unavailable')}</p>}
      {(st.kind === 'result' || st.kind === 'invalid') && <>
        <div className="pe-grid">
          {FIELDS.map(([k, unit]) => <div className="pe-f" key={k}><label htmlFor={`ft-${k}`}>{t(`ft_${k}` as I18nKey)}</label><div className="pe-in">
            <AdditionNumber id={`ft-${k}`} step={k === 'qa' ? 10 : k === 'friction' ? .05 : k.endsWith('Gamma') ? 1 : .1} min={0} value={f[k] as number} aria-invalid={bad === k || undefined} onValueChange={(v) => set({ [k]: v })} />{unit && <span className="unit">{unit}</span>}</div></div>)}
          <div className="pe-f pe-full"><label htmlFor="ft-source">{t('add_source')}</label><input id="ft-source" value={f.source} placeholder={t('ft_source_ph')} onChange={(e) => set({ source: e.target.value })} /></div>
          <label className="pe-f pe-full"><span><input type="checkbox" checked={f.confirmed} disabled={!f.source.trim()} onChange={(e) => set({ confirmed: e.target.checked })} /> {t('ft_confirm')}</span></label>
        </div>
        {bad && <p className="mw-error" role="alert">{t('ft_invalid', t(`ft_${bad}` as I18nKey))}</p>}
        {!f.confirmed && <p className="mw-note" role="note" style={{ color: 'var(--amber)' }}>{t('ft_assumed')}</p>}
        {st.kind === 'result' && <table>
          <thead><tr><th>{t('ft_group')}</th><th>{t('ft_size')}</th><th>{t('ft_bearing')}</th><th>{t('ft_ecc')}</th><th>{t('ft_sliding')}</th></tr></thead>
          <tbody>{st.result.rows.map((r) => <tr key={r.group}>
            <td>{t(`ft_group_${r.group}`)} <span className="mono" style={{ color: 'var(--muted)' }}>×{r.nodes} · N{r.node}</span></td>
            <td className="mono" style={{ color: r.ok ? undefined : 'var(--red)', fontWeight: 700 }}>{r.B.toFixed(1)} × {r.L.toFixed(1)} m{r.ok ? '' : ` — ${t('ft_ng', st.result.maxSize)}`}</td>
            {(['bearing', 'eccentricity', 'sliding'] as const).map((k) => <td key={k} className="mono" style={{ color: color(r.ratios[k]), fontWeight: 700 }}>{Number.isFinite(r.ratios[k]) ? r.ratios[k].toFixed(3) : '∞'} <span style={{ color: 'var(--muted)', fontWeight: 400 }}>{r.governing[k]}</span></td>)}
          </tr>)}</tbody>
        </table>}
        {st.kind === 'result' && <p className="mw-note">{t('ft_combos', st.result.combos)}</p>}
      </>}
    </div>
  )
}
