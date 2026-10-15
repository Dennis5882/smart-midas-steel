/* 공장 스펙 카드 — 편집 카드(story PlanEditor 형식). 입력 변경 → 디바운스 3D 미리보기.
   [실행] = Gen 전송, [취소] = 미리보기 해제. 실행되면(buildEpoch 증가) 모든 카드 버튼 제거 + 입력 잠금. */
import { useEffect, useMemo, useRef, useState } from 'react'
import { buildFactory } from '../actions/build'
import { profileOf } from '../codes'
import { counties, siteCoef, townsOf } from '../codes/twSites'
import type { FactorySpec } from '../domain/types'
import { t, type I18nKey } from '../i18n'
import { S, useStore, type ChatMsg } from '../state/store'
import { draw3D, previewSpec, tab } from '../state/ui'

type PlanMsg = Extract<ChatMsg, { kind: 'plan' }>

const PREVIEW_DEBOUNCE_MS = 250

/** 스펙 경로 ('span', 'sections.column', 'seismic.SDS' …) */
type Path = string
interface Field {
  path: Path
  label: I18nKey
  unit?: string
  kind: 'num' | 'int' | 'text' | 'select'
  /** select 값을 숫자로 저장 */
  numeric?: boolean
  /** 허용 최솟값 (기본: 0 초과) */
  min?: number
  options?: (spec: FactorySpec) => { value: string; label: string }[]
  full?: boolean
}
interface Group { title: I18nKey; fields: Field[] }

const GROUPS: Group[] = [
  { title: 'sec_geometry', fields: [
    { path: 'span', label: 'f_span', unit: 'm', kind: 'num' },
    { path: 'eaveHeight', label: 'f_eave', unit: 'm', kind: 'num' },
    { path: 'bays', label: 'f_bays', kind: 'int' },
    { path: 'baySpacing', label: 'f_baySpacing', unit: 'm', kind: 'num' },
    { path: 'roofSlope', label: 'f_slope', unit: 'rise/run', kind: 'num' },
    { path: 'baseFixity', label: 'f_base', kind: 'select', options: () => [
      { value: 'pinned', label: t('base_pinned') }, { value: 'fixed', label: t('base_fixed') }] },
    { path: 'purlinSpacing', label: 'f_purlinSp', unit: 'm', kind: 'num' },
    { path: 'girtSpacing', label: 'f_girtSp', unit: 'm', kind: 'num' },
    { path: 'postSpacing', label: 'f_postSp', unit: 'm', kind: 'num' },
    { path: 'sagRods', label: 'f_sagRods', kind: 'int', min: 0 },
  ] },
  { title: 'sec_sections', fields: [
    { path: 'sections.column', label: 'f_column', kind: 'text' },
    { path: 'sections.rafter', label: 'f_rafter', kind: 'text' },
    { path: 'sections.purlin', label: 'f_purlin', kind: 'text' },
    { path: 'sections.girt', label: 'f_girt', kind: 'text' },
    { path: 'sections.strut', label: 'f_strut', kind: 'text' },
    { path: 'sections.post', label: 'f_post', kind: 'text' },
    { path: 'sections.brace', label: 'f_brace', kind: 'text' },
    { path: 'material', label: 'f_material', kind: 'select', options: (sp) =>
      Object.keys(profileOf(sp.code).materials).map((m) => ({ value: m, label: m })) },
  ] },
  { title: 'sec_dead', fields: [
    { path: 'roofDead', label: 'f_roofDead', unit: 'kN/m²', kind: 'num' },
    { path: 'wallDead', label: 'f_wallDead', unit: 'kN/m²', kind: 'num' },
  ] },
  { title: 'sec_conn', fields: [
    { path: 'fc', label: 'f_fc', unit: 'MPa', kind: 'num' },
    { path: 'anchorFu', label: 'f_anchorFu', unit: 'MPa', kind: 'num' },
  ] },
  { title: 'sec_seismic', fields: [
    { path: 'seismic.county', label: 'f_county', kind: 'select', options: () => counties().map((c) => ({ value: c, label: c })) },
    { path: 'seismic.town', label: 'f_town', kind: 'select', options: (sp) => townsOf(sp.seismic.county).map((c) => ({ value: c, label: c })) },
    { path: 'seismic.soil', label: 'f_soil', kind: 'select', numeric: true, options: () => ([1, 2, 3] as const).map((v) => ({ value: String(v), label: t(`soil_${v}`) })) },
    { path: 'seismic.SDS', label: 'f_SDS', unit: 'g', kind: 'num' },
    { path: 'seismic.SD1', label: 'f_SD1', unit: 'g', kind: 'num' },
    { path: 'seismic.SMS', label: 'f_SMS', unit: 'g', kind: 'num' },
    { path: 'seismic.SM1', label: 'f_SM1', unit: 'g', kind: 'num' },
    { path: 'seismic.I', label: 'f_I', kind: 'num' },
    { path: 'seismic.Rx', label: 'f_Rx', kind: 'num' },
    { path: 'seismic.Ry', label: 'f_Ry', kind: 'num' },
  ] },
  { title: 'sec_wind', fields: [
    { path: 'wind.V10', label: 'f_V10', unit: 'm/s', kind: 'num' },
    { path: 'wind.I', label: 'f_Iw', kind: 'num' },
    { path: 'wind.exposure', label: 'f_exposure', kind: 'select', options: () => ['A', 'B', 'C'].map((v) => ({ value: v, label: v })) },
    { path: 'wind.enclosure', label: 'f_enclosure', kind: 'select', options: () => [
      { value: 'enclosed', label: t('encl_enclosed') }, { value: 'partial', label: t('encl_partial') }] },
  ] },
]
const FIELDS = GROUPS.flatMap((g) => g.fields)

const getPath = (o: any, p: Path): unknown => p.split('.').reduce((a, k) => a?.[k], o)
function setPath<T>(o: T, p: Path, v: unknown): T {
  const [k, ...rest] = p.split('.')
  return { ...(o as any), [k]: rest.length ? setPath((o as any)[k], rest.join('.'), v) : v }
}

/** 입력 문자열 → 스펙. 숫자가 아니거나 0 이하면 기존 값 유지 */
function toSpec(base: FactorySpec, vals: Record<Path, string>): FactorySpec {
  let sp = base
  for (const f of FIELDS) {
    const raw = vals[f.path]
    if (f.kind === 'num' || f.kind === 'int') {
      const n = f.kind === 'int' ? Math.round(+raw) : +raw
      if (Number.isFinite(n) && (f.min !== undefined ? n >= f.min : n > 0)) sp = setPath(sp, f.path, n)
    } else if (raw.trim()) sp = setPath(sp, f.path, f.numeric ? +raw : raw.trim())
  }
  return sp
}

const initVals = (sp: FactorySpec): Record<Path, string> =>
  Object.fromEntries(FIELDS.map((f) => [f.path, String(getPath(sp, f.path) ?? '')]))

export function PlanCard({ msg }: { msg: PlanMsg }) {
  const s = useStore()
  const [vals, setVals] = useState(() => initVals(msg.spec))
  const [cancelled, setCancelled] = useState(false)
  const dirty = useRef(false)
  const spec = useMemo(() => toSpec(msg.spec, vals), [msg.spec, vals])
  const live = s.buildEpoch === msg.epoch && !cancelled

  /* 편집 변경 → 3D 미리보기 (첫 렌더 제외) */
  useEffect(() => {
    if (!dirty.current) return
    const h = setTimeout(() => { tab('viewP'); previewSpec(spec) }, PREVIEW_DEBOUNCE_MS)
    return () => clearTimeout(h)
  }, [spec])

  const set = (p: Path, v: string) => {
    dirty.current = true
    setVals((o) => {
      const n = { ...o, [p]: v }
      /* 工址 선택 → 표2-1·2-4 로 SDS·SD1·SMS·SM1 채움 (군 변경 시 첫 鄉鎮) */
      if (p === 'seismic.county' || p === 'seismic.town' || p === 'seismic.soil') {
        if (p === 'seismic.county') n['seismic.town'] = townsOf(v)[0] ?? ''
        const c = siteCoef(n['seismic.county'], n['seismic.town'], (+n['seismic.soil'] || 1) as 1 | 2 | 3)
        if (c) for (const k of ['SDS', 'SD1', 'SMS', 'SM1'] as const) n[`seismic.${k}`] = String(c[k])
      }
      return n
    })
  }
  const site = siteCoef(spec.seismic.county, spec.seismic.town, spec.seismic.soil)

  return (
    <>
      <span dangerouslySetInnerHTML={{ __html: t('plan_intro') }} />
      <div className="plan-editor">
        {GROUPS.map((g) => (
          <div key={g.title} style={{ marginBottom: 12 }}>
            <div className="sec-divider" style={{ margin: '4px 0 10px' }}>{t(g.title)}</div>
            <div className="pe-grid">
              {g.fields.map((f) => (
                <div key={f.path} className={`pe-f${f.kind === 'text' ? ' pe-full' : ''}`}>
                  <label>{t(f.label)}</label>
                  <div className="pe-in">
                    {f.kind === 'select'
                      ? <select value={vals[f.path]} disabled={!live} onChange={(e) => set(f.path, e.target.value)}>
                          {f.options!(spec).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      : <input value={vals[f.path]} disabled={!live} inputMode={f.kind === 'text' ? 'text' : 'decimal'}
                          onChange={(e) => set(f.path, e.target.value)} />}
                    {f.unit && <span className="pe-u">{f.unit}</span>}
                  </div>
                </div>
              ))}
            </div>
            {g.title === 'sec_seismic' && site && (site.fault || site.basin || site.note) && (
              <div className="pe-tip" style={{ color: site.fault ? 'var(--amber)' : undefined }}>
                {site.fault ? t('site_fault', site.fault) : site.basin ? t('site_basin') : site.note}
              </div>
            )}
          </div>
        ))}
        <div className="pe-tip">{t('plan_tip')}</div>
      </div>
      {live && (
        <div className="confirm-row">
          <button className="btn btn-c" disabled={s.busy} onClick={() => void buildFactory(spec)}>{t('exec')}</button>
          <button className="btn btn-ghost" onClick={() => { setCancelled(true); if (S.preview) draw3D() }}>{t('cancel')}</button>
        </div>
      )}
    </>
  )
}
