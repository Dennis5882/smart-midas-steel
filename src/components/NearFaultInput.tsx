/* 근단층 거리 입력 (TW 耐震規範 2.4·표2-3) — 鄉鎮이 걸친 단층 행마다 工址~단층 최단 수평거리(km).
   값은 'NF01:5;NF03:14' 한 문자열로 planFields 'seismic.nearFault' 칸에 저장된다. */
import { nearFaultRows } from '../codes/twNearFault'
import { t } from '../i18n'
import { NumericInput } from './NumericInput'

export function NearFaultInput({ id, county, town, value, disabled, invalid, onChange }: {
  id: string; county: string; town: string; value: string; disabled: boolean; invalid: boolean; onChange(v: string): void
}) {
  const rows = nearFaultRows(county, town)
  const raw: Record<string, string> = Object.fromEntries(value.split(';').filter(Boolean).map((p) => { const [k, v] = p.split(':'); return [k, v ?? ''] }))
  const update = (rid: string, v: string) => onChange(rows.map((r) => `${r.id}:${r.id === rid ? v : raw[r.id] ?? ''}`).join(';'))
  return <div className="nf-input" id={id}>
    {rows.map((r) => <label key={r.id} className="nf-row">
      <span>{r.faults.join('、')}</span>
      <NumericInput id={`${id}-${r.id}`} value={raw[r.id] ?? ''} disabled={disabled} step={0.5} min={0} title={t('numeric_wheel_hint')}
        onValueChange={(v) => update(r.id, v)} aria-invalid={invalid && !(raw[r.id] ?? '').trim()} />
      <span className="pe-u">km</span>
    </label>)}
    <small>{t('nf_hint', rows.length)}</small>
  </div>
}
