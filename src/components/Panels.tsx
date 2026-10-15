/* 우측 패널 — 활동 로그 · 모델 상태 · 해석 결과 */
import { useEffect, useMemo, useRef, type CSSProperties, type ReactNode } from 'react'
import { downloadDrawings, openReport } from '../actions/outputs'
import { profileOf } from '../codes'
import { buildLoadPayloads, type LoadInfo } from '../domain/loads'
import { buildPortal } from '../domain/portal'
import type { ConnResult } from '../domain/connections'
import type { DesignResult } from '../domain/design'
import { ROLES, type FactoryModel, type FactorySpec } from '../domain/types'
import { t, type I18nKey } from '../i18n'
import { useStore, type AppState } from '../state/store'

export function LogPanel() {
  const s = useStore()
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const box = ref.current?.parentElement
    if (box) box.scrollTop = box.scrollHeight
  }, [s.log.length])
  return (
    <div id="log" ref={ref}>
      {s.log.length === 0 && <div className="empty">{t('log_empty')}</div>}
      {s.log.map((l) => (
        <div key={l.id} className={`ln ${l.type}`}>
          <span className="ts">{l.ts}</span><span className="m" dangerouslySetInnerHTML={{ __html: l.html }} />
        </div>
      ))}
    </div>
  )
}

function KV({ k, v, hi, style }: { k: string; v: ReactNode; hi?: boolean; style?: CSSProperties }) {
  return <div className="kv"><span className="k">{k}</span><span className={`v${hi ? ' hi' : ''}`} style={style}>{v}</span></div>
}

interface Shown { spec: FactorySpec; model: FactoryModel; info: LoadInfo; cases: number; combos: number; preview: boolean }

/** 표시 대상 — 편집 중 미리보기(오프라인 계산) 우선, 없으면 Gen 에 보낸 모델 */
function shownOf(s: AppState): Shown | null {
  if (s.preview) {
    const model = buildPortal(s.preview)
    const l = buildLoadPayloads(s.preview, model)
    return { spec: s.preview, model, info: l.info, cases: Object.keys(l.STLD).length, combos: Object.keys(l['LCOM-GEN']).length, preview: true }
  }
  const b = s.built
  return b ? { spec: b.spec, model: b.model, info: b.info, cases: b.cases.length, combos: b.combos, preview: false } : null
}

const f1 = (x: number) => x.toFixed(1)
const f3 = (x: number) => x.toFixed(3)

export function ModelPanel() {
  const s = useStore()
  const sh = useMemo(() => shownOf(s), [s.viewNonce, s.built])
  if (!sh) return <div className="res-empty">{t('model_empty')}</div>
  const { spec: sp, model: m, info } = sh
  const count = (r: string) => m.elements.filter((e) => e.role === r).length
  const seis = (d: 'X' | 'Y') => `${info.seismic[d].T.toFixed(3)} s · ${f3(info.seismic[d].c)} · ${f1(info.seismic[d].V)} kN`

  return (
    <div>
      {sh.preview && <div className="res-stat">{t('preview_tag')}</div>}
      <div className="statgrid">
        <div className="stat"><div className="n">{m.nodes.length}</div><div className="l">{t('st_node')}</div></div>
        <div className="stat"><div className="n">{m.elements.length}</div><div className="l">{t('st_elem')}</div></div>
        <div className="stat"><div className="n">{sh.cases}</div><div className="l">{t('st_case')}</div></div>
      </div>
      <div className="scard"><h3>{t('sec_geom')}</h3>
        <KV k={t('kv_code')} v={t(profileOf(sp.code).labelKey)} hi />
        <KV k={t('kv_span')} v={`${sp.span} m`} hi />
        <KV k={t('kv_length')} v={`${sp.bays} × ${sp.baySpacing} = ${f1(sp.bays * sp.baySpacing)} m`} />
        <KV k={t('kv_eave')} v={`${sp.eaveHeight} m`} />
        <KV k={t('kv_slope')} v={`${sp.roofSlope} (${f1((Math.atan(sp.roofSlope) * 180) / Math.PI)}°)`} />
        <KV k={t('kv_base')} v={t(sp.baseFixity === 'fixed' ? 'base_fixed' : 'base_pinned')} />
        {ROLES.map((r) => (
          <KV key={r} k={t(`role_${r}`)} v={count(r)} />
        ))}
      </div>
      <div className="scard"><h3>{t('sec_prop')}</h3>
        <KV k={t('kv_mat')} v={sp.material} />
        <KV k={t('f_column')} v={sp.sections.column} />
        <KV k={t('f_rafter')} v={sp.sections.rafter} />
        <KV k={t('f_purlin')} v={sp.sections.purlin} />
        <KV k={t('f_girt')} v={sp.sections.girt} />
        <KV k={t('f_strut')} v={sp.sections.strut} />
        <KV k={t('f_post')} v={sp.sections.post} />
        <KV k={t('f_brace')} v={sp.sections.brace} />
      </div>
      <div className="scard"><h3>{t('sec_load')}</h3>
        <KV k={t('kv_roofLive')} v={`${f3(info.roofLive)} kN/m²`} />
        <KV k={t('kv_W')} v={`${f1(info.seismic.W)} kN`} />
        <KV k={t('kv_EX')} v={seis('X')} hi />
        <KV k={t('kv_EY')} v={seis('Y')} hi />
        <KV k={t('kv_qh')} v={`${f3(info.wind.qh)} kN/m² (h = ${info.wind.hRef} m)`} />
        <KV k={t('kv_cpRoof')} v={`${f3(info.wind.windwardRoofCp.high)} / ${f3(info.wind.windwardRoofCp.low)}`} />
        <KV k={t('kv_combos')} v={sh.combos} />
      </div>
    </div>
  )
}

const ratioColor = (r: number) => (r > 1 ? 'var(--red)' : r > 0.9 ? 'var(--amber)' : 'var(--green)')
const PART = ['I', '1/4', '2/4', '3/4', 'J']
/** 변위각은 1/n, 처짐은 mm */
const svcVal = (k: string, v: number) => (k.endsWith('Defl') ? `${(v * 1000).toFixed(1)} mm` : `1/${Math.round(1 / Math.max(v, 1e-9))}`)

function DesignTables({ d }: { d: DesignResult }) {
  const ngAll = d.members.filter((m) => m.ratio > 1).sort((a, b) => b.ratio - a.ratio)
  return (
    <>
      <div className="scard"><h3>{t('res_design')}</h3>
        <div style={{ overflow: 'auto' }}>
          <table>
            <thead><tr><th>{t('rd_role')}</th><th>{t('rd_section')}</th><th>{t('rd_elem')}</th><th>{t('rd_ratio')}</th><th>{t('rd_eq')}</th><th>{t('rd_combo')}</th><th>{t('rd_mode')}</th></tr></thead>
            <tbody>
              {ROLES.filter((r) => d.byRole[r]).map((r) => {
                const m = d.byRole[r]!
                return (
                  <tr key={r} title={m.notes.join(' / ')}>
                    <td>{t(`role_${r}`)}</td><td>{m.section}</td><td>{m.id}{m.part >= 0 ? ` (${PART[m.part]})` : ''}</td>
                    <td style={{ color: ratioColor(m.ratio), fontWeight: 700 }}>{m.ratio.toFixed(3)}</td>
                    <td>{m.eq}</td><td>{m.combo}</td>
                    <td style={{ color: 'var(--muted)' }}>{m.eq === 'KL/r' ? `KL/r ${m.slender.value.toFixed(0)}/${m.slender.limit}` : m.cap.mxMode}{m.notes.length ? ' *' : ''}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="res-stat" style={{ marginTop: 10, marginBottom: 0 }}>{t('rd_assump')}</div>
      </div>
      <div className="scard"><h3>{t('res_service')}</h3>
        <table>
          <thead><tr><th>{t('sv_item')}</th><th>{t('sv_value')}</th><th>{t('sv_limit')}</th><th>{t('rd_ratio')}</th><th>{t('sv_clause')}</th></tr></thead>
          <tbody>
            {d.service.map((sv) => (
              <tr key={sv.key}>
                <td>{t(`sv_${sv.key}`)}</td><td>{svcVal(sv.key, sv.value)}</td><td>{svcVal(sv.key, sv.limit)}</td>
                <td style={{ color: ratioColor(sv.ratio), fontWeight: 700 }}>{sv.ratio.toFixed(3)}</td><td style={{ color: 'var(--muted)' }}>{sv.clause}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {ngAll.length > 0 && (
        <div className="scard"><h3>{t('res_ng')} ({ngAll.length})</h3>
          <table>
            <thead><tr><th>{t('rd_elem')}</th><th>{t('rd_role')}</th><th>{t('rd_section')}</th><th>{t('rd_ratio')}</th><th>{t('rd_combo')}</th></tr></thead>
            <tbody>
              {ngAll.slice(0, 30).map((m) => (
                <tr key={m.id}><td>{m.id}</td><td>{t(`role_${m.role}`)}</td><td>{m.section}</td>
                  <td style={{ color: 'var(--red)', fontWeight: 700 }}>{m.ratio.toFixed(3)}</td><td>{m.combo}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

function ConnTables({ cs }: { cs: ConnResult[] }) {
  return (
    <div className="scard"><h3>{t('res_conn')}</h3>
      {cs.map((c) => (
        <div key={c.type} style={{ marginBottom: 12 }}>
          <div className="kv"><span className="k"><b style={{ color: 'var(--txt-hi)' }}>{t(`cn_type_${c.type}`)}</b> · {c.combo}</span>
            <span className="v" style={{ color: ratioColor(c.ratio), fontWeight: 700 }}>{c.ratio.toFixed(3)}</span></div>
          <div style={{ fontSize: '.78rem', color: 'var(--muted)', margin: '4px 0 6px' }}>
            {Object.values(c.dims).join(' · ')}
            {c.notes.map((n) => <span key={n} style={{ color: 'var(--amber)' }}> · {n.startsWith('doubler') ? `${t('cn_note_doubler')} ${n.slice(8)}` : n === 'stiffeners' ? t('cn_note_stiffeners') : n}</span>)}
          </div>
          <table>
            <thead><tr><th>{t('sv_item')}</th><th>{t('cn_demand')}</th><th>{t('cn_capacity')}</th><th>{t('rd_ratio')}</th><th>{t('sv_clause')}</th></tr></thead>
            <tbody>
              {c.checks.map((k) => (
                <tr key={k.item}>
                  <td>{t(`cn_${k.item}` as I18nKey)}</td><td>{k.demand.toFixed(2)} {k.unit}</td><td>{k.capacity.toFixed(2)} {k.unit}</td>
                  {c.dims.stiffener && k.item === 'flangeBend'
                    ? <td style={{ color: 'var(--muted)' }}>{k.ratio.toFixed(3)} → {t('cn_stiffener')}</td>
                    : <td style={{ color: ratioColor(k.ratio), fontWeight: 700 }}>{k.ratio.toFixed(3)}</td>}
                  <td style={{ color: 'var(--muted)' }}>{k.clause}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}

export function ResultsPanel() {
  const s = useStore()
  if (!s.reactions?.length && !s.design) return <div className="res-empty">{t('res_empty')}</div>
  return (
    <div>
      {s.built && (
        <div className="confirm-row" style={{ marginTop: 0, marginBottom: 12 }}>
          <button className="btn btn-c" onClick={openReport}>{t('g_design_2')}</button>
          <button className="btn btn-ghost" onClick={downloadDrawings}>{t('g_design_3')}</button>
        </div>
      )}
      {s.design && <DesignTables d={s.design} />}
      {!!s.connections?.length && <ConnTables cs={s.connections} />}
      {!!s.reactions?.length && (
        <div className="scard"><h3>{t('res_react')}</h3>
          <table>
            <thead><tr><th>{t('res_lc')}</th><th>FX (kN)</th><th>FY (kN)</th><th>FZ (kN)</th></tr></thead>
            <tbody>
              {s.reactions.map((r) => (
                <tr key={r.lc}><td>{r.lc}</td><td>{f3(r.fx)}</td><td>{f3(r.fy)}</td><td>{f3(r.fz)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
