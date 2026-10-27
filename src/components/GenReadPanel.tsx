/* Gen 하중 불러오기 (F2 1단계) — 해석 단계 화면. 불러오기 → 해석 전 확인(모델 동일·케이스·조합·안내) → 확정 → 해석 후 케이스별 반력 대조 */
import { useState } from 'react'
import { acceptGenLoads, acceptUnavailable, discardGenLoads, readbackUnavailable, readGenLoads, setComboKind } from '../actions/readback'
import type { ComboKind } from '../codes'
import { GEN_FIXED_DBS, WARN_ISSUES, type GenCase, type GenCombo, type GenLoadSummary } from '../domain/genLoads'
import { t } from '../i18n'
import { useStore } from '../state/store'

const KINDS: ComboKind[] = ['basic', 'amplified', 'gravity', 'asd']
const f1 = (x: number) => (Math.abs(x) < 0.05 ? '0.0' : x.toFixed(1))
const comp = (c: GenCombo) => c.parts.map((p, i) => `${i ? (p.f < 0 ? ' − ' : ' + ') : p.f < 0 ? '−' : ''}${Math.abs(p.f) === 1 ? '' : Math.abs(p.f)}${p.lc}`).join('')

/* reactions 가 있으면(해석 후) 합력 칸마다 위 = 읽은 합계, 아래 = 반력(−) — 좁은 패널에서 열 수를 늘리지 않게 하중 항목 열은 뺀다 */
function CaseTable({ s, reactions }: { s: GenLoadSummary; reactions?: Map<string, { fx: number; fy: number; fz: number }> }) {
  const counts = (c: GenCase) => (['self', 'beam', 'nodal', 'local', 'moment'] as const).filter((k) => c.counts[k]).map((k) => `${t(`rb_cnt_${k}`)} ${c.counts[k]}`).join(' · ') || '—'
  return <table className="gr-table"><thead><tr>
    <th>{t('rb_case')}</th><th>{t('rb_type')}</th>{!reactions && <th>{t('rb_items')}</th>}<th>ΣFX</th><th>ΣFY</th><th>ΣFZ</th>
  </tr></thead><tbody>{s.cases.map((c) => {
    const r = reactions?.get(c.name), ap = c.approx ? '≈' : ''
    const cell = (v: number, rv: number | undefined) => <td className="mono">{ap}{f1(v)}{reactions && <span className="gr-react">{rv === undefined ? '—' : f1(-rv)}</span>}</td>
    return <tr key={c.name}>
      <td className="mono">{c.name}</td><td>{c.type}</td>{!reactions && <td>{counts(c)}</td>}
      {cell(c.sum.fx, r?.fx)}{cell(c.sum.fy, r?.fy)}{cell(c.sum.fz, r?.fz)}
    </tr>
  })}</tbody></table>
}

export function GenReadPanel() {
  const s = useStore()
  const [ok, setOk] = useState(false)
  const b = s.built
  if (!b) return null
  const why = readbackUnavailable(b)
  const read = s.genRead && s.genRead.built === b ? s.genRead : null

  /* 확정된 엔지니어 하중 — 해석 후 케이스별 반력 대조 (반력 = −하중) */
  if (b.genLoads && !read) {
    const reactions = s.reactions?.length ? new Map(s.reactions.map((r) => [r.lc, r])) : undefined
    return <section className="gen-read" aria-label={t('rb_title')}>
      <h3>{t('rb_active', b.genLoads.cases.length, b.genLoads.combos.length)}</h3>
      {reactions && <p className="mw-note">{t('rb_react_note')}</p>}
      <CaseTable s={b.genLoads} reactions={reactions} />
      <p className="mw-note">{t('rb_limits')}</p>
      <button className="btn btn-ghost" disabled={s.busy} onClick={() => { setOk(false); void readGenLoads() }}>{t('rb_reread')}</button>
    </section>
  }

  if (!read) return <section className="gen-read" aria-label={t('rb_title')}>
    <h3>{t('rb_title')}</h3>
    {/* 모델 + 자중만이면 위 차단 안내(flow_model_only)가 같은 내용을 말한다 */}
    {!b.modelOnly && <p className="mw-note">{t('rb_hint')}</p>}
    {why && <p className="task-warning">{t(why)}</p>}
    <button className={`btn ${b.modelOnly ? 'btn-c' : 'btn-ghost'}`} disabled={!!why || s.busy || !!s.confirm} onClick={() => { setOk(false); void readGenLoads() }}>{t('rb_read')}</button>
  </section>

  const sm = read.summary, block = acceptUnavailable()
  return <section className="gen-read" aria-label={t('rb_title')}>
    <h3>{t('rb_confirm_title')}</h3>
    <p className="task-success">✓ {t(read.sections ? 'rb_model_same_sect' : 'rb_model_same', GEN_FIXED_DBS.length)}</p>
    {read.sections && <>
      <h4>{t('rb_sect_title', read.sections.changes.length)}</h4>
      <table className="gr-table"><thead><tr><th>{t('rd_role')}</th><th>{t('rb_sect_from')}</th><th>{t('rb_sect_to')}</th><th>{t('rb_sect_count')}</th></tr></thead><tbody>
        {read.sections.changes.map((c) => <tr key={c.role}><td>{t(`role_${c.role}`)}</td><td className="mono">{c.from}</td><td className="mono">{c.to}</td><td className="mono">{c.count}</td></tr>)}
      </tbody></table>
      <p className="mw-note">{t('rb_sect_note')}</p>
    </>}
    {read.sectionOptions.length > 0 && <p className="task-warning">{t('rb_sect_options', read.sectionOptions.join(', '))}</p>}
    <h4>{t('rb_cases', sm.cases.length)}</h4>
    <CaseTable s={sm} />
    {sm.cases.some((c) => c.approx || c.counts.self) && <p className="mw-note">{t('rb_sum_note')}</p>}
    <h4>{t('rb_combos', sm.combos.length)}</h4>
    <table className="gr-table"><thead><tr><th>{t('rb_combo')}</th><th>{t('rb_comp')}</th><th>{t('rb_kind')}</th><th></th></tr></thead><tbody>
      {sm.combos.map((c, i) => <tr key={`${c.name}-${i}`}><td className="mono">{c.name}</td><td className="mono">{comp(c)}</td>
        <td><select aria-label={`${t('rb_kind')} ${c.name}`} value={read.kinds[c.name] ?? c.kind} disabled={s.busy} onChange={(e) => setComboKind(c.name, e.target.value as ComboKind)}>
          {KINDS.map((k) => <option key={k} value={k}>{t(`rb_kind_${k}`)}</option>)}
        </select></td>
        <td>{c.issues.map((k) => <span key={k} className={`gr-badge ${WARN_ISSUES.has(k) ? 'warn' : 'bad'}`}>{t(`rb_issue_${k}`)}</span>)}</td></tr>)}
    </tbody></table>
    <p className="mw-note">{t('rb_kind_note')}</p>
    {(sm.opaque.length > 0 || sm.notices.length > 0) && <ul className="gr-notes">
      {sm.opaque.length > 0 && <li>{t('rb_opaque', sm.opaque.join(', '))}</li>}
      {sm.notices.map((n) => <li key={n}>{n === 'unusedCase' ? t('rb_notice_unusedCase', sm.unused.join(', ')) : t(`rb_notice_${n}`)}</li>)}
    </ul>}
    <p className="mw-note">{t('rb_wind_pressure')}</p>
    <p className="mw-note">{t('rb_limits')}</p>
    {block && block !== 'rb_stale' && <p className="task-warning">{t(block)}</p>}
    <label className="cfm-skip"><input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} /> {t('rb_check')}</label>
    <div className="cfm-row">
      <button className="btn btn-ghost" disabled={s.busy} onClick={discardGenLoads}>{t('cancel')}</button>
      <button className="btn btn-c" disabled={!ok || !!block || s.busy} onClick={() => void acceptGenLoads()}>{t('rb_accept')}</button>
    </div>
  </section>
}
