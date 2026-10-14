/* 우측 패널 — 활동 로그 · 모델 상태 · 해석 결과 */
import { useEffect, useMemo, useRef, type CSSProperties, type ReactNode } from 'react'
import { profileOf } from '../codes'
import { buildLoadPayloads, type LoadInfo } from '../domain/loads'
import { buildPortal } from '../domain/portal'
import type { FactoryModel, FactorySpec } from '../domain/types'
import { t } from '../i18n'
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
        {(['column', 'rafter', 'purlin', 'girt', 'strut'] as const).map((r) => (
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

export function ResultsPanel() {
  const s = useStore()
  if (!s.reactions?.length) return <div className="res-empty">{t('res_empty')}</div>
  return (
    <div>
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
    </div>
  )
}
