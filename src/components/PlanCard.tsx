import { TW_SYSTEMS_X, TW_SYSTEMS_Y, type TwSystemX, type TwSystemY } from '../codes/twSystems'
import { initializeAdditions } from './AdditionEditor'
import { additionErrors } from '../domain/additions'
import type { FactoryAdditions } from '../domain/additionTypes'
/* 기본 모델링: 시작 → 횡단면 → 베이 → 재료 → 추가 구조 → 지역·하중 → 확인.
   자유골조(mode 'free'): 처음부터 편집 카드, 베이 수·간격 대신 베이별 간격 목록.
   편집 카드(story PlanEditor 형식): 입력 변경 → 디바운스 3D 미리보기.
   [실행] = Gen 전송, [취소] = 미리보기 해제. 실행되면(buildEpoch 증가) 모든 카드 버튼 제거 + 입력 잠금. */
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { buildFactory } from '../actions/build'
import { siteCoef, townsOf } from '../codes/twSites'
import { windV10 } from '../codes/twWind'
import { nearFaultRows } from '../codes/twNearFault'
import { NearFaultInput } from './NearFaultInput'
import { regionZoneKR, ZONE_Z } from '../codes/krLateral'
import type { TemplateKey } from '../domain/templates'
import { TEMPLATES, TEMPLATE_KEYS } from '../domain/templates'
import { ModelWizard, WIZARD_STEPS } from './ModelWizard'
import { StructureEditor, StructureSummary } from './StructureEditor'
import { WindLoadInfo } from './WindPreview'
import { ADDITIONS_STEP, LOADS_STEP, PREVIEW_DEBOUNCE_MS, REVIEW_STEP, STEP_CAM, scopeIssueStep } from './modelingFlow'
import { BaseFixityPicker, FrameTypePicker } from './FrameControls'
import { BaySpacingEditor } from './BaySpacingEditor'
import { NumericInput } from './NumericInput'
import { SectionPicker } from './SectionPicker'
import { FigureButton, FigureNote } from './FigureRef'
import { siteSourceText, windSourceText, rSourceText } from './Status'
import { ScopeBox } from './ScopeBox'
import { checkScope, NO_FEATURES, type ScopeFeatures } from '../domain/scope'
import { hasInteriorColumns, lengthText, type FactorySpec, type ElementRole } from '../domain/types'
import { t, tc } from '../i18n'
import { advancedTitleKey, fieldConflicts, fieldStep, groupsFor, initVals, invalidFields, numericStep, toSpec, type Group, type Path } from './planFields'
import { S, notify, useStore, type ChatMsg } from '../state/store'
import { restraintKeys, support } from '../domain/validity'
import { draw3D, previewSpec, tab } from '../state/ui'

type PlanMsg = Extract<ChatMsg, { kind: 'plan' }>


/** 최종 확인의 형상·단면·지역 요약. */
function Summary({ spec, tpl }: { spec: FactorySpec; tpl?: TemplateKey }) {
  const k = tpl ?? 'general'
  const sec = spec.sections
  const row = (label: string, v: string) => <><span className="k">{label}</span> {v}<br /></>
  const kr = spec.code === 'KR' ? spec.korea : undefined
  const site = spec.code === 'CN' && spec.china
    ? `w0 ${spec.china.w0} kN/m² · ${spec.china.terrain} · αmax ${spec.china.alphaMax} · Tg ${spec.china.Tg} s · S0 ${spec.china.snow} kN/m²`
    : kr ? `V0 ${kr.V0} m/s · ${kr.exposure} · ${t(kr.zone === '1' ? 'zone_1' : 'zone_2')} · S ${kr.S} · ${kr.site} · Sg ${kr.Sg} kN/m²`
    : `${spec.seismic.county} ${spec.seismic.town} · ${t(`soil_${spec.seismic.soil}`)} · SDS ${spec.seismic.SDS} / SD1 ${spec.seismic.SD1} · V10 ${spec.wind.V10} m/s`
  return (
    <div className="plan">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9, paddingBottom: 8, borderBottom: '1px dashed var(--line2)' }}>
        <div><span className="plan-type">{t(`tpl_${k}`)}</span></div>
      </div>
      {row(t('f_frame'), t(`frame_${spec.frame ?? 'gable'}`))}
      {row(t('f_span'), hasInteriorColumns(spec) && spec.spanList ? `${spec.span} m (${spec.spanList.join(' + ')})` : `${spec.span} m`)}
      {row(t('kv_length'), lengthText(spec))}
      {row(t('f_eave'), `${spec.eaveHeight} m · ${t('f_slope')} ${spec.roofSlope} · ${t('f_base')} ${t(spec.baseFixity === 'fixed' ? 'base_fixed' : 'base_pinned')}`)}
      {row(t('f_column'), `${sec.column} · ${t('f_rafter')} ${sec.rafter}`)}
      {row(t('f_material'), spec.material)}
      {restraintKeys(spec).map((k) => <div key={k}>{row(t(`restraint_${k}`), t(`restraint_${support(spec, k)}`))}</div>)}
      <div className="plan-sub">
        <span className="k">{t('f_purlin')}</span> {sec.purlin} · <span className="k">{t('f_girt')}</span> {sec.girt} · <span className="k">{t('f_brace')}</span> {sec.brace}<br />
        <span className="k">{t('ps_site')}</span> {site}
      </div>
    </div>
  )
}

/** Gen 으로 보낼 내용 선택 (라디오 2개) */
function GenContentPicker({ name, value, onChange, disabled }: { name: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return <fieldset className="mw-group gen-content" disabled={disabled}>
    <legend>{t('mw_gen_content')}</legend>
    {([[false, 'gc_full', 'gc_full_d'], [true, 'gc_model', 'gc_model_d']] as const).map(([v, k, d]) => (
      <label key={k} className="gc-opt"><input type="radio" name={name} checked={value === v} onChange={() => onChange(v)} /> <b>{t(k)}</b><span className="mw-note">{t(d)}</span></label>
    ))}
  </fieldset>
}

export function PlanCard({ msg }: { msg: PlanMsg }) {
  const s = useStore()
  const free = msg.mode === 'free'
  /* 시작 화면에서 템플릿을 이미 골랐으면 같은 선택을 다시 묻지 않고 횡단면부터 (시작 단계는 되돌아가 바꿀 수 있음) */
  const opened = msg.fromStart ? 1 : 0
  const [step, setStep] = useState(opened)
  const [visited, setVisited] = useState(opened)
  const [attempted, setAttempted] = useState(false)
  const [selectedTpl, setSelectedTpl] = useState(msg.tpl ?? 'general')
  const formId = useId()
  const [vals, setVals] = useState(() => initVals(msg.spec))
  const [individual, setIndividual] = useState(free || !!msg.spec.bayList?.length)
  /* Gen 으로 보낼 내용 — 정상 모델링(하중·조합) / 모델 + 자중만 (현지 요청 2026-10-21: 엔지니어가 Gen 에서 하중을 직접 넣는 경우) */
  /* 편집기 메시지(S.activePlan)에 같이 기억 — 시작 화면에 다녀와 편집기가 다시 마운트돼도 선택 유지 */
  const [modelOnly, updateModelOnly] = useState(() => !!msg.modelOnly)
  const setModelOnly = (v: boolean) => {
    updateModelOnly(v)
    if (S.activePlan?.id === msg.id) { S.activePlan = { ...S.activePlan, modelOnly: v }; notify() }
  }
  const dirty = useRef(false)
  const [additions, setAdditions] = useState<FactoryAdditions | undefined>(()=>initializeAdditions(msg.spec))
  const [feat, updateFeat] = useState<ScopeFeatures>(() => msg.spec.features ?? NO_FEATURES)
  const spec = useMemo(() => ({ ...toSpec(msg.spec, vals, free, individual), features: feat, additions }), [msg.spec, vals, free, individual, feat, additions])
  const setFeat = (f: ScopeFeatures) => { dirty.current = true; updateFeat(f); setAdditions(initializeAdditions({...spec, features:f}, additions)) }
  const blocked = checkScope(spec).blocked
  const live = s.buildEpoch === msg.epoch && s.workspaceView === 'model' && s.task === 'model' && !(s.opt && (msg.modelRevision ?? 0) < s.modelRevision)
  const groups = groupsFor(spec.code, free, spec.frame, individual)
  const invalid = invalidFields(spec, vals, free, individual)
  /* 칸 사이 충돌(치수 한계·간격 과대)도 그 칸의 오류로 — 해당 단계에서 막는다 */
  const conflicts = fieldConflicts(spec, vals, free, individual)
  const errors = [...invalid, ...conflicts.map((c) => c.field), ...additionErrors(spec).map((e) => ({path:'additions.'+e.path, label:e.key, kind:'text' as const}))]
  const previewInvalid = invalid.length > 0 || conflicts.length > 0 || additionErrors(spec,false).length > 0
  const previewBlocked = checkScope(spec).issues.some((i)=>i.level==='block' && i.key!=='additionInput')
  /* 자유골조는 한 화면 직접 편집 → 오류를 바로 표시. 위저드는 다음 단계로 넘어가려 할 때 */
  const showErrors = attempted || free

  useEffect(() => {
    if (!live || s.busy) return
    const invalid = errors.length > 0 || blocked
    if (S.draftInvalid !== invalid) { S.draftInvalid = invalid; notify() }
  }, [live, s.busy, errors.length, blocked])

  useEffect(() => {
    if (live && !s.busy && !errors.length && !blocked) { S.draftSpec = spec; notify() }
  }, [spec, live, s.busy, errors.length, blocked])

  /* 결과 화면 「확인할 것」 → 해당 단계·칸 (현재 편집기만). 단계를 바꾼 뒤 렌더가 끝나면(아래 effect) 칸을 찾아 포커스 —
     접힌 details 는 열고, 아직 없으면 몇 프레임 다시 찾는다 (타이머 추측 금지) */
  const [jumpTarget, setJumpTarget] = useState<string | null>(null)
  useEffect(() => {
    const path = s.fieldJump
    if (!path || !live || s.busy) return
    S.fieldJump = null
    const target = fieldStep({ path })
    setStep(target); setVisited((old) => Math.max(old, target)); setJumpTarget(path)
    notify()
  }, [s.fieldJump, live, s.busy])
  useEffect(() => {
    if (!jumpTarget) return
    let frame = 0, raf = 0
    const find = () => {
      const group = document.getElementById(`${formId}-${jumpTarget}`) ?? document.getElementById(`${formId}-${jumpTarget}-0`)
      const field = group?.matches('input, select, textarea') ? group : group?.querySelector<HTMLElement>('input, select, textarea') ?? group
      if (field) {
        const fold = field.closest('details'); if (fold) fold.open = true
        field.scrollIntoView({ block: 'center' }); field.focus(); setJumpTarget(null)
      } else if (++frame < 20) raf = requestAnimationFrame(find)
      else setJumpTarget(null)
    }
    find()
    return () => cancelAnimationFrame(raf)
  }, [jumpTarget, step, formId])

  const closeEditor = () => {
    S.workspaceView = 'start'
    if (S.preview) draw3D()
    notify()
  }

  /* 편집 변경 → 3D 미리보기 (첫 렌더 제외) */
  useEffect(() => {
    if (!dirty.current || !live || s.busy || previewInvalid || previewBlocked) return
    const h = setTimeout(() => { tab('viewP'); previewSpec(spec) }, PREVIEW_DEBOUNCE_MS)
    return () => clearTimeout(h)
  }, [spec, live, s.busy, previewInvalid, previewBlocked])

  const invalidateAdditions = () => setAdditions((a)=>a ? {...a,equipment:a.equipment.map((e)=>({...e,confirmed:false})),crane:a.crane && {...a.crane,confirmed:false,runway:a.crane.runway && {...a.crane.runway,confirmed:false}},wallOpening:a.wallOpening && {...a.wallOpening,confirmed:false},roofOpening:a.roofOpening && {...a.roofOpening,confirmed:false},floorOpening:a.floorOpening && {...a.floorOpening,confirmed:false},link:a.link && {...a.link,confirmed:false},platform:a.platform && {...a.platform,confirmed:false},factors:{...a.factors,confirmed:false}} : a)
  const set = (p: Path, v: string) => {
    dirty.current = true
    if (fieldStep({path:p}) < ADDITIONS_STEP) invalidateAdditions()
    if (p === 'frame') updateFeat((old)=>({...old,multiSpan:v==='multi'||v==='gableCols'}))
    setVals((o) => {
      const n = { ...o, [p]: v }
      if (!individual && (p === 'bays' || p === 'baySpacing') && Number.isInteger(+n.bays) && +n.bays > 0 && +n.bays <= 1000 && Number.isFinite(+n.baySpacing) && +n.baySpacing > 0) {
        n.bayList = Array.from({ length: +n.bays }, () => n.baySpacing).join(', ')
      }
      /* 工址 선택 → 표2-1(근단층이면 표2-3 거리 보간)·2-4 로 SDS·SD1·SMS·SM1, 耐風規範 2.4 로 V10 채움 (군 변경 시 첫 鄉鎮) */
      if (msg.spec.code === 'TW' && (p === 'seismic.county' || p === 'seismic.town' || p === 'seismic.soil' || p === 'seismic.nearFault')) {
        if (p === 'seismic.county') n['seismic.town'] = townsOf(v)[0] ?? ''
        if (p === 'seismic.county' || p === 'seismic.town') {
          n['seismic.nearFault'] = '' // 다른 鄉鎮의 단층 거리를 쓰지 않는다
          const w = windV10(n['seismic.county'], n['seismic.town'])
          if (w) n['wind.V10'] = String(w.V10)
        }
        const c = siteCoef(n['seismic.county'], n['seismic.town'], (+n['seismic.soil'] || 1) as 1 | 2 | 3, n['seismic.nearFault'])
        if (c) for (const k of ['SDS', 'SD1', 'SMS', 'SM1'] as const) n[`seismic.${k}`] = String(c[k])
      }
      /* TW 표1-3 시스템 → R */
      if (msg.spec.code === 'TW' && p === 'seismic.systemX') n['seismic.Rx'] = String(TW_SYSTEMS_X[v as TwSystemX]?.R ?? n['seismic.Rx'])
      if (msg.spec.code === 'TW' && p === 'seismic.systemY') n['seismic.Ry'] = String(TW_SYSTEMS_Y[v as TwSystemY]?.R ?? n['seismic.Ry'])
      /* KR 지진구역 → S = Z × 2.0 (KDS 41 17 00 3.2, Z 는 KDS 17 10 00 표 4.2-2 통상값) */
      if (msg.spec.code === 'KR' && p === 'korea.zone') { n['korea.S'] = String(+(ZONE_Z[v as '1' | '2'] * 2).toFixed(3)); n['korea.region'] = 'manual' }
      /* 행정구역 → 지진구역(KDS 17 10 00 표 4.2-1) → S = Z × 2.0 */
      const rz = msg.spec.code === 'KR' && p === 'korea.region' ? regionZoneKR(v) : undefined
      if (rz) { n['korea.zone'] = rz; n['korea.S'] = String(+(ZONE_Z[rz] * 2).toFixed(3)) }
      return n
    })
  }
  const site = spec.code === 'TW' ? siteCoef(spec.seismic.county, spec.seismic.town, spec.seismic.soil, spec.seismic.nearFault) : null

  const fields = (g: Group, readonly = false) => <div className="pe-grid">{g.fields.filter((f) => f.path !== 'seismic.nearFault' || nearFaultRows(spec.seismic.county, spec.seismic.town).length > 0).map((f) => {
    const id = `${formId}-${f.path}`
    const bad = invalid.some((x) => x.path === f.path)
    const conflict = bad ? undefined : conflicts.find((c) => c.field.path === f.path)
    const error = showErrors && (bad || !!conflict)
    return <div key={f.path} className={`pe-f${f.kind === 'text' || f.full ? ' pe-full' : ''}`}>
      <label htmlFor={f.path === 'baseFixity' ? undefined : id}>{t(f.label)}</label>
      <div className="pe-in">
        {f.path === 'seismic.nearFault'
          ? <NearFaultInput id={id} county={spec.seismic.county} town={spec.seismic.town} value={vals[f.path] ?? ''} disabled={!live || s.busy || readonly} invalid={error} onChange={(v) => set(f.path, v)} />
          : f.path === 'baseFixity'
          ? <BaseFixityPicker id={id} value={vals[f.path]} disabled={!live || s.busy || readonly} onChange={(v) => set(f.path, v)} />
          : f.path.startsWith('sections.')
          ? <SectionPicker id={id} spec={spec} role={f.path.slice('sections.'.length) as ElementRole} value={vals[f.path]}
              disabled={!live || s.busy || readonly} invalid={error} errorId={error ? `${id}-error` : undefined} onChange={(v) => set(f.path, v)} />
          : f.kind === 'select'
          ? <select id={id} value={vals[f.path]} disabled={!live || s.busy || readonly} onChange={(e) => set(f.path, e.target.value)} aria-invalid={error} aria-describedby={error ? `${id}-error` : undefined}>
              {f.options!(spec).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          : f.kind === 'num' || f.kind === 'int'
          ? <NumericInput id={id} value={vals[f.path]} disabled={!live || s.busy || readonly} step={numericStep(f)} min={f.min}
              onValueChange={(v) => set(f.path, v)} title={t('numeric_wheel_hint')} aria-invalid={error} aria-describedby={error ? `${id}-error` : undefined} />
          : <input id={id} className={f.path.startsWith('sections.') ? 'pe-code' : f.kind === 'list' ? 'pe-numeric-list' : undefined} value={vals[f.path]} disabled={!live || s.busy || readonly} inputMode="text"
              onChange={(e) => set(f.path, e.target.value)} aria-invalid={error} aria-describedby={error ? `${id}-error` : undefined} />}
        {f.unit && <span className="pe-u">{f.unit}</span>}
        {f.figure && <FigureButton fig={f.figure} />}
      </div>
      {f.figure && <FigureNote fig={f.figure} />}
      {f.path === 'restraints.flyBraces' && <small>{t('restraint_note')}</small>}
      {error && <small className="mw-error" id={`${id}-error`}>{conflict ? conflict.text : f.kind === 'list' ? t('mw_list_error') : f.path.startsWith('sections.') ? t('mw_section_error', msg.spec.sections.column)
        : !vals[f.path]?.trim() ? t('mw_required') : f.kind === 'int' && !Number.isInteger(Number(vals[f.path])) ? t('mw_integer')
        : f.kind === 'num' || f.kind === 'int' ? f.min === undefined ? t('mw_positive') : t('mw_min', f.min) : t('mw_field_error')}</small>}
    </div>
  })}</div>

  function navigate(target: number) {
    if (!live || s.busy) return
    if (target > step) {
      const first = errors.filter((f) => fieldStep(f) < target).sort((a,b)=>fieldStep(a)-fieldStep(b))[0]
      if (first) {
        setAttempted(true); goStep(fieldStep(first))
        /* 오류 칸으로 포커스 — 스크롤 아래·접힌 고급 칸이어도 문구가 보이게 (단계 전환·펼침 렌더 뒤) */
        const focusId = first.path.startsWith('additions.') ? `${formId}-additions.${first.path.slice('additions.'.length)}`
          : `${formId}-${first.path === 'bayList' && !free ? 'bayList-0' : first.path}`
        setTimeout(() => {
          const group=document.getElementById(focusId)
          const field=group?.querySelector<HTMLElement>('[aria-invalid="true"]:not(:disabled)')??group?.querySelector<HTMLElement>('[data-error-target]:not(:disabled)')??group
          field?.focus()
        }, 60)
        return
      }
      const issue = checkScope(spec).issues.find((i)=>i.level==='block' && scopeIssueStep(i.key)<target)
      if (issue) { setAttempted(true); goStep(scopeIssueStep(issue.key)); return }
    }
    setAttempted(false)
    goStep(target)
    setVisited((old) => Math.max(old, target))
  }

  /* 사용자가 단계를 옮기면(오류 단계로 되돌아가는 것 포함) 그 단계의 3D 시점 (STEP_CAM) — 돌려 놓은 시점도 다시 맞춤(camReset).
     새 편집기는 session 이 첫 단계 시점으로 연다. 편집기 재개·결과 화면 [수정] 이동·6·7 단계는 보던 시점을 그대로 둔다 */
  function goStep(target: number) {
    const cam = target !== step ? STEP_CAM[target] : undefined
    setStep(target)
    if (cam) { S.cam = cam; S.camReset++; notify() }
  }

  if (!free) return <ModelWizard spec={spec} step={step} visited={visited} disabled={!live || s.busy}
    onStep={navigate} blocked={checkScope(spec).issues.some((i)=>i.level==='block' && i.key!=='additionInput')} invalid={errors.length > 0} attempted={attempted}
    onBuild={() => { if (errors.length || blocked) { setAttempted(true); return }; void buildFactory(spec, { modelOnly }) }}
    onCancel={closeEditor} onChangeCode={closeEditor} codeLocked={s.busy || !!s.confirm}>
    {step === 0 && <>
      <div className="mw-templates">{TEMPLATE_KEYS.map((key) => <button type="button" key={key} aria-pressed={selectedTpl === key}
        disabled={!live || s.busy} onClick={() => { setSelectedTpl(key); setIndividual(false); invalidateAdditions(); if (S.activePlan?.id === msg.id) S.activePlan = { ...S.activePlan, tpl: key }; dirty.current = true; setVals((old) => ({ ...old, ...Object.fromEntries(Object.entries(TEMPLATES[key]).map(([k, v]) => [k, String(v)])), bayList: Array.from({ length: TEMPLATES[key].bays }, () => TEMPLATES[key].baySpacing).join(', ') })); notify() }}>
        <strong>{t(`tpl_${key}`)}</strong><span>{TEMPLATES[key].span} m · {TEMPLATES[key].bays * TEMPLATES[key].baySpacing} m</span>
      </button>)}</div>
      <p className="mw-note">{t('mw_template_note')}</p>
    </>}
    {step === 2 && <section className="mw-group">
      <h4>{t('bay_spacing_title')}</h4>
      <BaySpacingEditor id={`${formId}-bayList`} individual={individual} raw={vals.bayList} disabled={!live || s.busy}
        invalid={showErrors && invalid.some((f) => f.path === 'bayList')}
        onMode={(mode) => {
          if (mode === individual) return
          dirty.current = true
          invalidateAdditions()
          if (!mode) setVals((old) => ({ ...old, bays: String(spec.bays), baySpacing: String(spec.baySpacing) }))
          setIndividual(mode); setAttempted(false)
        }} onChange={(raw) => set('bayList', raw)} />
      {!individual && fields({ title: 'sec_geometry', fields: groups.flatMap((g) => g.fields).filter((f) => ['bays', 'baySpacing'].includes(f.path)) })}
    </section>}
    {step === LOADS_STEP && <StructureSummary spec={spec} onEdit={()=>navigate(ADDITIONS_STEP)} disabled={!live || s.busy}/>}
    {step > 0 && step < REVIEW_STEP && groups.map((g) => {
      const filtered = { ...g, fields: g.fields.filter((f) => fieldStep(f) === step && !['frame', 'bays', 'baySpacing', 'bayList'].includes(f.path)) }
      if (!filtered.fields.length) return null
      const advanced = g.title === 'sec_conn' ? filtered.fields
        : step === 2 ? filtered.fields.filter((f) => !['bays', 'baySpacing'].includes(f.path))
        : step === 3 ? filtered.fields.filter((f) => !['sections.column', 'sections.rafter', 'material'].includes(f.path))
        : step === LOADS_STEP && spec.code === 'TW' && g.title === 'sec_wind' ? filtered.fields.filter((f) => f.path === 'wind.Kzt')
        : step === LOADS_STEP && spec.code === 'TW' && g.title === 'sec_seismic' ? filtered.fields.filter((f) => !['siteBasis', 'siteEvidence', 'seismic.county', 'seismic.town', 'seismic.nearFault', 'seismic.soil'].includes(f.path))
        : step === LOADS_STEP && spec.code === 'KR' ? filtered.fields.filter((f) => ['korea.Kzt', 'korea.KD', 'korea.roofZeta', 'korea.S'].includes(f.path)) : []
      const basic = filtered.fields.filter((f) => !advanced.includes(f))
      return <section className="mw-group" key={g.title}>
        {basic.length > 0 && <><h4>{t(g.title)}</h4>
          {step === 1 && g.title === 'sec_geometry' && <FrameTypePicker code={spec.code} value={spec.frame ?? 'gable'} disabled={!live || s.busy} onChange={(frame) => set('frame', frame)} />}
          {fields({ ...g, fields: basic })}</>}
        {advanced.length > 0 && <details className="mw-advanced" open={attempted && advanced.some((f) => errors.includes(f)) || undefined}>
          <summary>{t(advancedTitleKey(g.title, step))}<span>{t('mw_advanced')}</span></summary>
          {fields({ ...g, fields: advanced })}
        </details>}
        {g.title === 'sec_seismic' && <div className="pe-tip">{t('kv_site_src')}: {siteSourceText(spec)}</div>}
        {g.title === 'sec_seismic' && spec.code === 'TW' && <div className="pe-tip">{t('kv_r_src')}: {rSourceText(spec)}</div>}
        {g.title === 'sec_wind' && spec.code === 'TW' && <div className="pe-tip">{t('kv_wind_src')}: {windSourceText(spec)}</div>}
        {g.title === 'sec_wind' && step === LOADS_STEP && <WindLoadInfo spec={spec} />}
        {g.title === 'sec_seismic' && site && (site.fault || site.basin || site.note) && <div className="pe-tip">{site.fault ? t('site_fault', site.fault) : site.basin ? t('site_basin') : site.note}</div>}
      </section>
    })}
    {step === ADDITIONS_STEP && <StructureEditor idPrefix={`${formId}-additions`} spec={spec} onFeaturesChange={setFeat} onChange={(v)=>{dirty.current=true;setAdditions(v)}} disabled={!live || s.busy} attempted={attempted}/>}
    {step === LOADS_STEP && <p className="mw-note">{tc(spec.code, 'plan_tip')}</p>}
    {step === LOADS_STEP && spec.code === 'KR' && <p className="mw-note">{t('kr_scope_note')}</p>}
    {step > 0 && step < REVIEW_STEP && checkScope(spec).issues.some((i)=>scopeIssueStep(i.key)===step) && <ScopeBox spec={spec} />}
    {step === REVIEW_STEP && <>
      <Summary spec={spec} tpl={selectedTpl} />
      <StructureSummary spec={spec} onEdit={()=>navigate(ADDITIONS_STEP)} disabled={!live || s.busy}/>
      <ScopeBox spec={spec} />
      {WIZARD_STEPS.slice(1, REVIEW_STEP).map((key, index) => index+1===ADDITIONS_STEP?null:<details className="mw-review" key={key}>
        <summary>{t(key)}<span>{t('mw_details')}</span></summary>
        <button className="btn btn-ghost" disabled={!live || s.busy} onClick={() => navigate(index + 1)}>{t('edit_btn')}</button>
        {groups.map((g) => { const subset = { ...g, fields: g.fields.filter((f) => fieldStep(f) === index + 1) }; return subset.fields.length ? <section className="mw-group" key={g.title}><h4>{t(g.title)}</h4>{fields(subset, true)}</section> : null })}
      </details>)}
      <GenContentPicker name={`${formId}-gen-content`} value={modelOnly} onChange={setModelOnly} disabled={!live || s.busy} />
      {!modelOnly && <p className="mw-note">{t('mw_build_note')}</p>}
    </>}
  </ModelWizard>

  return (
    <>
      <span dangerouslySetInnerHTML={{ __html: t('plan_intro_free') }} />
      <ScopeBox spec={spec} />
      <div className="plan-editor">
        {spec.code === 'CN' && <div className="pe-tip">{t('cn_scope_note')}</div>}
        {spec.code === 'KR' && <div className="pe-tip">{t('kr_scope_note')}</div>}
        {groupsFor(spec.code, free, spec.frame).map((g) => (
          <div key={g.title} style={{ marginBottom: 12 }}>
            <div className="sec-divider" style={{ margin: '4px 0 10px' }}>{t(g.title)}</div>
            {fields(g)}
            {g.title === 'sec_seismic' && (
              <div className="pe-tip" style={spec.code === 'TW' && !siteSourceText(spec).startsWith(t('site_src_table')) ? { color: 'var(--amber)' } : undefined}>{t('kv_site_src')}: {siteSourceText(spec)}</div>
            )}
            {g.title === 'sec_wind' && spec.code === 'TW' && <div className="pe-tip">{t('kv_wind_src')}: {windSourceText(spec)}</div>}
            {g.title === 'sec_wind' && <WindLoadInfo spec={spec} />}
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
      <StructureEditor idPrefix={`${formId}-additions`} spec={spec} onFeaturesChange={setFeat} onChange={(v)=>{dirty.current=true;setAdditions(v)}} disabled={!live || s.busy} attempted={showErrors}/>
      {live && <GenContentPicker name={`${formId}-gen-content`} value={modelOnly} onChange={setModelOnly} disabled={s.busy} />}
      {live && errors.length > 0 && <p className="mw-error mw-alert" role="alert">{t('mw_invalid')}</p>}
      {live && (
        <div className="confirm-row">
          <button className="btn btn-c" disabled={s.busy || blocked || errors.length > 0} title={blocked ? t('sc_blocked') : errors.length ? t('mw_invalid') : undefined}
            onClick={() => { if (errors.length || blocked) return; void buildFactory(spec, { modelOnly }) }}>{t('exec')}</button>
          <button className="btn btn-ghost" disabled={s.busy} onClick={closeEditor}>{t('ws_home')}</button>
        </div>
      )}
    </>
  )
}
