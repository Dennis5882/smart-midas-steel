/* 공장 스펙 카드 — 기본 모델링은 6단계 업무 흐름, 자유골조는 직접 편집.
   기본 모델링(mode 'template'): 범위 → 횡단면 → 베이 → 재료 → 하중 → 확인·생성.
   자유골조(mode 'free'): 처음부터 편집 카드, 베이 수·간격 대신 베이별 간격 목록.
   편집 카드(story PlanEditor 형식): 입력 변경 → 디바운스 3D 미리보기.
   [실행] = Gen 전송, [취소] = 미리보기 해제. 실행되면(buildEpoch 증가) 모든 카드 버튼 제거 + 입력 잠금. */
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { buildFactory } from '../actions/build'
import { profileOf } from '../codes'
import { counties, siteCoef, townsOf } from '../codes/twSites'
import type { TemplateKey } from '../domain/templates'
import { TEMPLATES, TEMPLATE_KEYS } from '../domain/templates'
import { sectionProps } from '../domain/sections'
import { ModelWizard, WIZARD_STEPS } from './ModelWizard'
import { siteSourceText } from './Status'
import { ScopeBox } from './ScopeBox'
import { checkScope, NO_FEATURES, type ScopeFeatures } from '../domain/scope'
import { baySpans, lengthText, normalizeBays, type FactorySpec } from '../domain/types'
import { t, tc, type I18nKey } from '../i18n'
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
  /** list = 숫자 목록 '6, 6, 7.5' (자유골조 베이별 간격) */
  kind: 'num' | 'int' | 'text' | 'select' | 'list'
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
const CN_GROUPS: Group[] = [
  { title: 'sec_wind', fields: [
    { path: 'china.w0', label: 'f_cn_w0', unit: 'kN/m²', kind: 'num', min: .3 },
    { path: 'china.terrain', label: 'f_exposure', kind: 'select', options: () => ['A', 'B', 'C', 'D'].map((v) => ({ value: v, label: v })) },
    { path: 'china.betaZ', label: 'f_cn_beta', kind: 'num', min: 1 },
    { path: 'china.topography', label: 'f_cn_topo', kind: 'num', min: .75 },
  ] },
  { title: 'sec_seismic', fields: [
    { path: 'china.alphaMax', label: 'f_cn_alpha', kind: 'select', numeric: true, options: () => [.04, .08, .12, .16, .24, .32].map((n) => ({ value: String(n), label: String(n) })) },
    { path: 'china.Tg', label: 'f_cn_Tg', unit: 's', kind: 'num', min: .1 },
    { path: 'china.Tx', label: 'f_cn_Tx', unit: 's', kind: 'num' },
    { path: 'china.Ty', label: 'f_cn_Ty', unit: 's', kind: 'num' },
    { path: 'china.damping', label: 'f_cn_damping', kind: 'num', min: .045 },
  ] },
  { title: 'sec_cn_snow', fields: [
    { path: 'china.snow', label: 'f_cn_snow', unit: 'kN/m²', kind: 'num', min: 0 },
    { path: 'china.snowMu', label: 'f_cn_snowMu', kind: 'num', min: .9 },
    { path: 'china.gamma0', label: 'f_cn_gamma0', kind: 'num', min: 1 },
  ] },
  { title: 'sec_conn', fields: [
    { path: 'china.concreteBearing', label: 'f_cn_concrete', unit: 'MPa', kind: 'num' },
    { path: 'china.anchorFt', label: 'f_cn_anchor', unit: 'MPa', kind: 'select', numeric: true, options: () => [140, 180].map((n) => ({ value: String(n), label: `${n}` })) },
  ] },
]
const BAY_LIST: Field = { path: 'bayList', label: 'f_bayList', unit: 'm', kind: 'list', full: true }
/** 자유골조: 형상의 베이 수·간격 → 베이별 간격 목록 한 칸 */
const freeGeometry = (g: Group): Group => g.title !== 'sec_geometry' ? g
  : { ...g, fields: [BAY_LIST, ...g.fields.filter((f) => f.path !== 'bays' && f.path !== 'baySpacing')] }
const groupsFor = (code: FactorySpec['code'], free = false) =>
  (code === 'CN' ? [...GROUPS.filter((g) => !['sec_wind', 'sec_seismic', 'sec_conn'].includes(g.title)), ...CN_GROUPS] : GROUPS)
    .map((g) => free ? freeGeometry(g) : g)
const FIELDS = [...GROUPS, ...CN_GROUPS].flatMap((g) => g.fields)
const parseList = (raw: string) => raw.split(/[,，、\s]+/).filter(Boolean).map(Number)

const getPath = (o: any, p: Path): unknown => p.split('.').reduce((a, k) => a?.[k], o)
function setPath<T>(o: T, p: Path, v: unknown): T {
  const [k, ...rest] = p.split('.')
  return { ...(o as any), [k]: rest.length ? setPath((o as any)[k], rest.join('.'), v) : v }
}

/** 입력 문자열 → 스펙. 숫자가 아니거나 0 이하면 기존 값 유지 (목록은 하나라도 틀리면 기존 값) */
function toSpec(base: FactorySpec, vals: Record<Path, string>, free: boolean): FactorySpec {
  let sp = free ? base : { ...base, bayList: undefined }
  for (const f of groupsFor(base.code, free).flatMap((g) => g.fields)) {
    const raw = vals[f.path]
    if (f.kind === 'list') {
      const l = parseList(raw)
      if (l.length && l.every((v) => Number.isFinite(v) && v > 0)) sp = { ...sp, bayList: l }
    } else if (f.kind === 'num' || f.kind === 'int') {
      const n = f.kind === 'int' ? Math.round(+raw) : +raw
      if (Number.isFinite(n) && (f.min !== undefined ? n >= f.min : n > 0)) sp = setPath(sp, f.path, n)
    } else if (raw.trim()) sp = setPath(sp, f.path, f.numeric ? +raw : raw.trim())
  }
  return normalizeBays(sp)
}

const initVals = (sp: FactorySpec): Record<Path, string> => ({
  ...Object.fromEntries(FIELDS.map((f) => [f.path, String(getPath(sp, f.path) ?? '')])),
  bayList: baySpans(sp).join(', '),
})

function invalidField(f: Field, raw: string, spec: FactorySpec): boolean {
  if (!raw?.trim()) return true
  if (f.kind === 'select') return !f.options!(spec).some((o) => o.value === raw)
  if (f.kind === 'num' || f.kind === 'int') {
    const n = Number(raw)
    return !Number.isFinite(n) || (f.min === undefined ? n <= 0 : n < f.min) || (f.kind === 'int' && !Number.isInteger(n))
  }
  if (f.path.startsWith('sections.')) {
    try {
      const p = sectionProps(raw)
      return ![p.A, p.Ix, p.Iy, p.d, p.bf, p.tw, p.tf, p.h].every((v) => Number.isFinite(v) && v > 0)
    } catch { return true }
  }
  return false
}

const fieldStep = (f: Field) => ['span', 'eaveHeight', 'roofSlope', 'baseFixity'].includes(f.path) ? 1
  : ['bays', 'baySpacing', 'purlinSpacing', 'girtSpacing', 'postSpacing', 'sagRods'].includes(f.path) ? 2
  : f.path.startsWith('sections.') || f.path === 'material' || ['fc', 'anchorFu', 'china.concreteBearing', 'china.anchorFt'].includes(f.path) ? 3 : 4

/** 최종 확인의 형상·단면·지역 요약. */
function Summary({ spec, tpl }: { spec: FactorySpec; tpl?: TemplateKey }) {
  const k = tpl ?? 'general'
  const sec = spec.sections
  const row = (label: string, v: string) => <><span className="k">{label}</span> {v}<br /></>
  const site = spec.code === 'CN' && spec.china
    ? `w0 ${spec.china.w0} kN/m² · ${spec.china.terrain} · αmax ${spec.china.alphaMax} · Tg ${spec.china.Tg} s · S0 ${spec.china.snow} kN/m²`
    : `${spec.seismic.county} ${spec.seismic.town} · ${t(`soil_${spec.seismic.soil}`)} · SDS ${spec.seismic.SDS} / SD1 ${spec.seismic.SD1} · V10 ${spec.wind.V10} m/s`
  return (
    <div className="plan">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9, paddingBottom: 8, borderBottom: '1px dashed var(--line2)' }}>
        <div><span className="plan-type">{t(`tpl_${k}`)}</span></div>
      </div>
      {row(t('f_span'), `${spec.span} m`)}
      {row(t('kv_length'), lengthText(spec))}
      {row(t('f_eave'), `${spec.eaveHeight} m · ${t('f_slope')} ${spec.roofSlope} · ${t('f_base')} ${t(spec.baseFixity === 'fixed' ? 'base_fixed' : 'base_pinned')}`)}
      {row(t('f_column'), `${sec.column} · ${t('f_rafter')} ${sec.rafter}`)}
      {row(t('f_material'), spec.material)}
      <div className="plan-sub">
        <span className="k">{t('f_purlin')}</span> {sec.purlin} · <span className="k">{t('f_girt')}</span> {sec.girt} · <span className="k">{t('f_brace')}</span> {sec.brace}<br />
        <span className="k">{t('ps_site')}</span> {site}
      </div>
    </div>
  )
}

export function PlanCard({ msg }: { msg: PlanMsg }) {
  const s = useStore()
  const free = msg.mode === 'free'
  const [step, setStep] = useState(0)
  const [visited, setVisited] = useState(0)
  const [attempted, setAttempted] = useState(false)
  const [selectedTpl, setSelectedTpl] = useState(msg.tpl ?? 'general')
  const formId = useId()
  const [vals, setVals] = useState(() => initVals(msg.spec))
  const [cancelled, setCancelled] = useState(false)
  const dirty = useRef(false)
  const [feat, setFeat] = useState<ScopeFeatures>(() => msg.spec.features ?? NO_FEATURES)
  const spec = useMemo(() => ({ ...toSpec(msg.spec, vals, free), features: feat }), [msg.spec, vals, free, feat])
  const blocked = checkScope(spec).blocked
  const live = s.buildEpoch === msg.epoch && !cancelled
  const groups = groupsFor(spec.code, free)
  const invalid = free ? [] : groups.flatMap((g) => g.fields).filter((f) => invalidField(f, vals[f.path], spec))

  /* 편집 변경 → 3D 미리보기 (첫 렌더 제외) */
  useEffect(() => {
    if (!dirty.current || !live || s.busy || invalid.length || blocked) return
    const h = setTimeout(() => { tab('viewP'); previewSpec(spec) }, PREVIEW_DEBOUNCE_MS)
    return () => clearTimeout(h)
  }, [spec, live, s.busy, blocked, invalid.length])

  const set = (p: Path, v: string) => {
    dirty.current = true
    setVals((o) => {
      const n = { ...o, [p]: v }
      /* 工址 선택 → 표2-1·2-4 로 SDS·SD1·SMS·SM1 채움 (군 변경 시 첫 鄉鎮) */
      if (msg.spec.code === 'TW' && (p === 'seismic.county' || p === 'seismic.town' || p === 'seismic.soil')) {
        if (p === 'seismic.county') n['seismic.town'] = townsOf(v)[0] ?? ''
        const c = siteCoef(n['seismic.county'], n['seismic.town'], (+n['seismic.soil'] || 1) as 1 | 2 | 3)
        if (c) for (const k of ['SDS', 'SD1', 'SMS', 'SM1'] as const) n[`seismic.${k}`] = String(c[k])
      }
      return n
    })
  }
  const site = spec.code === 'TW' ? siteCoef(spec.seismic.county, spec.seismic.town, spec.seismic.soil) : null

  const fields = (g: Group, readonly = false) => <div className="pe-grid">{g.fields.map((f) => {
    const id = `${formId}-${f.path}`
    const error = attempted && invalid.some((bad) => bad.path === f.path)
    return <div key={f.path} className={`pe-f${f.kind === 'text' || f.full ? ' pe-full' : ''}`}>
      <label htmlFor={id}>{t(f.label)}</label>
      <div className="pe-in">
        {f.kind === 'select'
          ? <select id={id} value={vals[f.path]} disabled={!live || s.busy || readonly} onChange={(e) => set(f.path, e.target.value)} aria-invalid={error} aria-describedby={error ? `${id}-error` : undefined}>
              {f.options!(spec).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          : <input id={id} value={vals[f.path]} disabled={!live || s.busy || readonly} inputMode={f.kind === 'text' || f.kind === 'list' ? 'text' : 'decimal'}
              onChange={(e) => set(f.path, e.target.value)} aria-invalid={error} aria-describedby={error ? `${id}-error` : undefined} />}
        {f.unit && <span className="pe-u">{f.unit}</span>}
      </div>
      {error && <small className="mw-error" id={`${id}-error`}>{f.path.startsWith('sections.') ? t('mw_section_error', msg.spec.sections.column)
        : !vals[f.path]?.trim() ? t('mw_required') : f.kind === 'int' && !Number.isInteger(Number(vals[f.path])) ? t('mw_integer')
        : f.kind === 'num' || f.kind === 'int' ? f.min === undefined ? t('mw_positive') : t('mw_min', f.min) : t('mw_field_error')}</small>}
    </div>
  })}</div>

  function navigate(target: number) {
    if (!live || s.busy) return
    if (target > step) {
      const first = invalid.find((f) => fieldStep(f) < target)
      if (first) { setAttempted(true); setStep(fieldStep(first)); return }
      if (blocked) { setAttempted(true); return }
    }
    setAttempted(false)
    setStep(target)
    setVisited((old) => Math.max(old, target))
  }

  if (!free) return <ModelWizard spec={spec} step={step} visited={visited} disabled={!live || s.busy}
    onStep={navigate} blocked={blocked} invalid={invalid.length > 0} attempted={attempted}
    onBuild={() => { if (invalid.length || blocked) { setAttempted(true); return }; void buildFactory(spec) }}
    onCancel={() => { setCancelled(true); if (S.preview) draw3D() }}>
    {step === 0 && <>
      <div className="mw-templates">{TEMPLATE_KEYS.map((key) => <button type="button" key={key} aria-pressed={selectedTpl === key}
        disabled={!live || s.busy} onClick={() => { setSelectedTpl(key); dirty.current = true; setVals((old) => ({ ...old, ...Object.fromEntries(Object.entries(TEMPLATES[key]).map(([k, v]) => [k, String(v)])) })) }}>
        <strong>{t(`tpl_${key}`)}</strong><span>{TEMPLATES[key].span} m · {TEMPLATES[key].bays * TEMPLATES[key].baySpacing} m</span>
      </button>)}</div>
      <p className="mw-note">{t('mw_template_note')}</p>
      <ScopeBox spec={spec} feat={feat} setFeat={setFeat} disabled={!live || s.busy} />
    </>}
    {step > 0 && step < 5 && groups.map((g) => {
      const filtered = { ...g, fields: g.fields.filter((f) => fieldStep(f) === step) }
      if (!filtered.fields.length) return null
      const advanced = g.title === 'sec_conn' ? filtered.fields
        : step === 2 ? filtered.fields.filter((f) => !['bays', 'baySpacing'].includes(f.path))
        : step === 3 ? filtered.fields.filter((f) => !['sections.column', 'sections.rafter', 'material'].includes(f.path))
        : step === 4 && spec.code === 'TW' && g.title === 'sec_seismic' ? filtered.fields.filter((f) => !['seismic.county', 'seismic.town', 'seismic.soil'].includes(f.path)) : []
      const basic = filtered.fields.filter((f) => !advanced.includes(f))
      return <section className="mw-group" key={g.title}>
        {basic.length > 0 && <><h4>{t(g.title)}</h4>{fields({ ...g, fields: basic })}</>}
        {advanced.length > 0 && <details className="mw-advanced" open={attempted && advanced.some((f) => invalid.includes(f)) || undefined}>
          <summary>{t(g.title === 'sec_conn' ? 'sec_conn' : step === 2 || step === 3 ? 'mw_secondary' : 'mw_coefficients')}<span>{t('mw_advanced')}</span></summary>
          {fields({ ...g, fields: advanced })}
        </details>}
        {g.title === 'sec_seismic' && <div className="pe-tip">{t('kv_site_src')}: {siteSourceText(spec)}</div>}
        {g.title === 'sec_seismic' && site && (site.fault || site.basin || site.note) && <div className="pe-tip">{site.fault ? t('site_fault', site.fault) : site.basin ? t('site_basin') : site.note}</div>}
      </section>
    })}
    {step === 4 && <p className="mw-note">{tc(spec.code, 'plan_tip')}</p>}
    {step > 0 && step < 5 && blocked && <ScopeBox spec={spec} feat={feat} setFeat={setFeat} disabled={!live || s.busy} />}
    {step === 5 && <>
      <Summary spec={spec} tpl={selectedTpl} />
      <ScopeBox spec={spec} feat={feat} setFeat={setFeat} disabled={!live || s.busy} />
      {WIZARD_STEPS.slice(1, 5).map((key, index) => <details className="mw-review" key={key}>
        <summary>{t(key)}<span>{t('mw_details')}</span></summary>
        <button className="btn btn-ghost" disabled={!live || s.busy} onClick={() => navigate(index + 1)}>{t('edit_btn')}</button>
        {groups.map((g) => { const subset = { ...g, fields: g.fields.filter((f) => fieldStep(f) === index + 1) }; return subset.fields.length ? <section className="mw-group" key={g.title}><h4>{t(g.title)}</h4>{fields(subset, true)}</section> : null })}
      </details>)}
      <p className="mw-note">{t('mw_build_note')}</p>
    </>}
  </ModelWizard>

  return (
    <>
      <span dangerouslySetInnerHTML={{ __html: t('plan_intro_free') }} />
      <ScopeBox spec={spec} feat={feat} setFeat={setFeat} disabled={!live} />
      <div className="plan-editor">
        {spec.code === 'CN' && <div className="pe-tip">{t('cn_scope_note')}</div>}
        {groupsFor(spec.code, free).map((g) => (
          <div key={g.title} style={{ marginBottom: 12 }}>
            <div className="sec-divider" style={{ margin: '4px 0 10px' }}>{t(g.title)}</div>
            {fields(g)}
            {g.title === 'sec_seismic' && (
              <div className="pe-tip" style={spec.code === 'TW' && !siteSourceText(spec).startsWith(t('site_src_table')) ? { color: 'var(--amber)' } : undefined}>{t('kv_site_src')}: {siteSourceText(spec)}</div>
            )}
            {g.title === 'sec_seismic' && site && (site.fault || site.basin || site.note) && (
              <div className="pe-tip" style={{ color: site.fault ? 'var(--amber)' : undefined }}>
                {site.fault ? t('site_fault', site.fault) : site.basin ? t('site_basin') : site.note}
              </div>
            )}
          </div>
        ))}
        {free && <div className="pe-tip">{t('free_tip', spec.bays, lengthText(spec))}</div>}
        <div className="pe-tip">{tc(spec.code, 'plan_tip')}</div>
      </div>
      {live && (
        <div className="confirm-row">
          <button className="btn btn-c" disabled={s.busy || blocked} title={blocked ? t('sc_blocked') : undefined} onClick={() => void buildFactory(spec)}>{t('exec')}</button>
          <button className="btn btn-ghost" onClick={() => { setCancelled(true); if (S.preview) draw3D() }}>{t('cancel')}</button>
        </div>
      )}
    </>
  )
}
