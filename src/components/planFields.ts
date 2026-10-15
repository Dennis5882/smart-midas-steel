/* 공장 스펙 입력 칸 정의·검증 (순수, JSX 없음) — PlanCard(기본 모델링 위저드·자유골조 편집) 공통.
   잘못된 칸이 하나라도 있으면 두 모드 모두 생성 불가 — 기존 값으로 조용히 대체해 전송하지 않는다. */
import { profileOf } from '../codes'
import { counties, townsOf } from '../codes/twSites'
import { sectionProps } from '../domain/sections'
import { portalGeometry } from '../domain/portal'
import { LIMITS } from '../domain/scope'
import { baySpans, normalizeBays, type FactorySpec } from '../domain/types'
import { t, type I18nKey } from '../i18n'

/** 스펙 경로 ('span', 'sections.column', 'seismic.SDS' …) */
export type Path = string
export interface Field {
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
export interface Group { title: I18nKey; fields: Field[] }

export const GROUPS: Group[] = [
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
export const CN_GROUPS: Group[] = [
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
export const groupsFor = (code: FactorySpec['code'], free = false) =>
  (code === 'CN' ? [...GROUPS.filter((g) => !['sec_wind', 'sec_seismic', 'sec_conn'].includes(g.title)), ...CN_GROUPS] : GROUPS)
    .map((g) => free ? freeGeometry(g) : g)
export const FIELDS = [...GROUPS, ...CN_GROUPS].flatMap((g) => g.fields)
export const parseList = (raw: string) => raw.split(/[,，、\s]+/).filter(Boolean).map(Number)

export const getPath = (o: any, p: Path): unknown => p.split('.').reduce((a, k) => a?.[k], o)
export function setPath<T>(o: T, p: Path, v: unknown): T {
  const [k, ...rest] = p.split('.')
  return { ...(o as any), [k]: rest.length ? setPath((o as any)[k], rest.join('.'), v) : v }
}

/** 입력 문자열 → 스펙. 잘못된 칸은 기존 값을 유지하지만 — 그 상태로는 생성되지 않는다(invalidFields 가 실행을 막음).
   여기서의 대체는 미리보기·요약이 깨지지 않게 하는 용도뿐이다. */
export function toSpec(base: FactorySpec, vals: Record<Path, string>, free: boolean): FactorySpec {
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

export const initVals = (sp: FactorySpec): Record<Path, string> => ({
  ...Object.fromEntries(FIELDS.map((f) => [f.path, String(getPath(sp, f.path) ?? '')])),
  bayList: baySpans(sp).join(', '),
})

/** 베이 목록 '6, 6, 7.5' — 비었거나, 숫자가 아니거나, 0 이하인 항목이 있으면 오류 */
export const listError = (raw: string) => { const l = parseList(raw); return !l.length || l.some((v) => !Number.isFinite(v) || v <= 0) }

export function invalidField(f: Field, raw: string, spec: FactorySpec): boolean {
  if (!raw?.trim()) return true
  if (f.kind === 'list') return listError(raw)
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

export const fieldStep = (f: Field) => ['span', 'eaveHeight', 'roofSlope', 'baseFixity'].includes(f.path) ? 1
  : ['bays', 'baySpacing', 'purlinSpacing', 'girtSpacing', 'postSpacing', 'sagRods'].includes(f.path) ? 2
  : f.path.startsWith('sections.') || f.path === 'material' || ['fc', 'anchorFu', 'china.concreteBearing', 'china.anchorFt'].includes(f.path) ? 3 : 4

/** 잘못된 입력 칸 — 기본 모델링·자유골조 공통 (자유골조는 베이 수·간격 대신 베이 목록) */
export const invalidFields = (spec: FactorySpec, vals: Record<Path, string>, free: boolean): Field[] =>
  groupsFor(spec.code, free).flatMap((g) => g.fields).filter((f) => invalidField(f, vals[f.path], spec))

/** 칸 사이 충돌 — 각 칸은 올바르지만 함께 두면 모델이 성립하지 않는 경우. 위저드가 그 칸의 단계에서 바로 막는다.
   ① 치수 한계(적용범위 block 과 같은 값) ② 간격이 커서 처마~마루·기초~처마·박공 사이에 부재가 하나도 안 들어감
   (portalGeometry 의 개수 = round(길이 / 간격) — 내부 부재가 생기려면 길이 / 간격 ≥ 1.5).
   관련 칸 중 하나라도 잘못이면 그 칸 오류가 먼저 — 여기서는 판단하지 않는다. */
export interface Conflict { field: Field; text: string }
const MIN_DIV = 1.5
export function fieldConflicts(spec: FactorySpec, vals: Record<Path, string>, free: boolean): Conflict[] {
  const fields = groupsFor(spec.code, free).flatMap((g) => g.fields)
  const bad = new Set(fields.filter((f) => invalidField(f, vals[f.path], spec)).map((f) => f.path))
  const ok = (...p: Path[]) => p.every((x) => !bad.has(x))
  const out: Conflict[] = []
  const add = (path: Path, text: string) => { const field = fields.find((f) => f.path === path); if (field) out.push({ field, text }) }
  const floor2 = (x: number) => Math.floor(x * 100) / 100
  if (ok('span') && spec.span > LIMITS.span) add('span', t('sc_span', spec.span))
  if (ok('eaveHeight') && spec.eaveHeight > LIMITS.eave) add('eaveHeight', t('sc_eave', spec.eaveHeight))
  if (ok('roofSlope') && spec.roofSlope > LIMITS.slope) add('roofSlope', t('sc_slope', spec.roofSlope))
  if (out.length) return out
  const G = portalGeometry(spec)
  const r2 = (x: number) => +x.toFixed(2)
  if (ok('span', 'roofSlope', 'purlinSpacing') && G.slopeLen / spec.purlinSpacing < MIN_DIV)
    add('purlinSpacing', t('mw_cf_purlin', r2(G.slopeLen), floor2(G.slopeLen / MIN_DIV)))
  if (ok('eaveHeight', 'girtSpacing') && spec.eaveHeight / spec.girtSpacing < MIN_DIV)
    add('girtSpacing', t('mw_cf_girt', spec.eaveHeight, floor2(spec.eaveHeight / MIN_DIV)))
  if (ok('span', 'postSpacing') && spec.span / Math.max(spec.postSpacing, 1) < MIN_DIV)
    add('postSpacing', t('mw_cf_post', spec.span, floor2(spec.span / MIN_DIV)))
  return out
}
