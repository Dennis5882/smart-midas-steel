/* Gen 에서 엔지니어가 바꾼 단면 받아들이기 (F2 2단계, 순수) — docs/reference/gen-readback-scope.md.
   앱 모델은 역할(기둥·지붕보…)마다 단면 하나(spec.sections[role]) — 같은 역할 요소가 모두 같은 새 단면이고 앱 단면 목록에 있으며
   단면 정의(형상·DB·DB 단면 이름·오프셋)도 앱이 만드는 것과 같으면 spec 을 바꿔 받아들인다. 그 밖(역할 안에서 섞임·목록 밖 단면·
   사용자 정의·요소 형식/재료/절점/각도 변경·요소 추가·삭제)은 막고 이유를 돌려준다. */
import { CATALOG } from './catalog'
import { buildGenPayloads } from './gen'
import { dbDifferences, diffText, isRecord } from './genSync'
import { buildPortal } from './portal'
import { sectionCatalogOptions } from './sectionCatalog'
import { withTrussDefaults, type ElementRole, type FactoryModel, type FactorySpec } from './types'

/** 받아들일 수 없는 단면 변경 — 화면 문구는 job.failText 가 현재 언어로(rb_sect_<reason>) */
export class SectionReviewError extends Error {
  /** role = 역할 식별자(화면에는 role_<id> 번역으로 — 영어 식별자를 문구에 넣지 않음) */
  constructor(readonly reason: 'elements' | 'mixed' | 'unknown' | 'definition', readonly detail: string, readonly role?: ElementRole) { super(`Gen section change not accepted: ${reason} ${role ?? ''} ${detail}`); this.name = 'SectionReviewError' }
}

/** 엔지니어 하중 모델에서 단면만 바꿀 수 없음 (형상·재료·지점·단부 해제가 보낸 모델과 다름 — updateSections) — 화면 문구 rb_geometry */
export class SectionUpdateError extends Error {
  constructor(readonly dbs: string[]) { super(`sections-only update not possible: ${dbs.join(', ')}`); this.name = 'SectionUpdateError' }
}

export interface SectionChange { role: ElementRole; from: string; to: string; count: number }
export type SectionReview =
  /** options — 해석 옵션(전단변형·뒴)이 앱 기본과 다른 단면 이름 (Gen 설정대로 해석됨 — 확인 화면 안내) */
  /** model = 받아들인 스펙의 모델 (단면 변경이 없으면 넘겨받은 모델 그대로 — 호출부가 다시 만들지 않게) */
  | { ok: true; spec: FactorySpec; model: FactoryModel; changes: SectionChange[]; options: string[] }
  | { ok: false; reason: 'elements' | 'mixed' | 'unknown' | 'definition'; detail: string; role?: ElementRole }

const squash = (s: string) => s.replace(/\s/g, '')

/** 역할의 앱 단면 후보 (카탈로그 + 국가·역할·재료 목록) — Gen 이름(공백 없음) → 앱 이름 */
function appNameOf(spec: FactorySpec, role: ElementRole, genName: string): string | null {
  const material = (role === 'purlin' || role === 'girt') && spec.secondaryMaterial ? spec.secondaryMaterial : spec.material
  let options: string[] = []
  try { options = sectionCatalogOptions(spec.code, role, material).map((o: { name: string }) => o.name) } catch { /* 목록 없음 */ }
  const names = [withTrussDefaults(spec).sections[role as keyof FactorySpec['sections']] ?? '', ...options, ...(spec.code === 'TW' ? CATALOG[role] ?? [] : [])]
  return names.find((n) => n && squash(n) === squash(genName)) ?? null
}

/** sentElem = 앱이 보낸(또는 마지막으로 확인한) ELEM, gotSect·gotElem = 지금 Gen */
export function reviewGenSections(spec: FactorySpec, model: FactoryModel, gotSect: unknown, gotElem: unknown): SectionReview {
  if (!isRecord(gotSect) || !isRecord(gotElem)) return { ok: false, reason: 'elements', detail: 'SECT/ELEM' }
  const p0 = buildGenPayloads(spec, model)
  /* 요소 집합·형식·재료·절점·각도는 그대로여야 함 (SECT 번호만 달라도 됨) */
  const noSect = (r: Record<string, unknown>) => Object.fromEntries(Object.entries(r).map(([id, e]) => [id, Object.fromEntries(Object.entries(e as Record<string, unknown>).filter(([k]) => k !== 'SECT'))]))
  const elemDiffs = dbDifferences('ELEM', noSect(p0.ELEM), noSect(gotElem as Record<string, unknown>), 3)
  if (elemDiffs.length) return { ok: false, reason: 'elements', detail: elemDiffs.map(diffText).join(', ') }
  /* 역할별 새 단면 이름 */
  const byRole = new Map<ElementRole, Map<string, number>>()
  for (const e of model.elements) {
    const sid = (gotElem[String(e.id)] as Record<string, unknown>)?.SECT
    const rec = gotSect[String(sid)] as Record<string, unknown> | undefined
    const name = typeof rec?.SECT_NAME === 'string' ? rec.SECT_NAME : `#${sid}`
    const m = byRole.get(e.role) ?? new Map<string, number>()
    byRole.set(e.role, m)
    m.set(name, (m.get(name) ?? 0) + 1)
  }
  const sections = { ...spec.sections }
  const changes: SectionChange[] = []
  /* 지금 단면 = Gen 에 보낸 것 (트러스 하현재·웨브를 비워 두면 기본 단면) */
  const sent = withTrussDefaults(spec).sections
  for (const [role, names] of byRole) {
    const cur = sent[role as keyof FactorySpec['sections']] ?? ''
    if (names.size > 1) return { ok: false, reason: 'mixed', detail: [...names.keys()].join(' / '), role: role as ElementRole }
    const [genName, count] = [...names][0]
    if (squash(genName) === squash(cur)) continue
    const app = appNameOf(spec, role, genName)
    if (!app) return { ok: false, reason: 'unknown', detail: genName, role: role as ElementRole }
    ;(sections as Record<string, string>)[role] = app
    changes.push({ role, from: cur, to: app, count })
  }
  const next: FactorySpec = { ...spec, sections }
  /* 단면 정의 — 앱이 같은 이름으로 만드는 SECT 와 같아야 함 (사용자 정의·오프셋 변경 등은 받아들이지 않음) */
  const nextModel = changes.length ? buildPortal(next) : model
  const p1 = changes.length ? buildGenPayloads(next, nextModel) : p0
  const want = new Map(Object.values(p1.SECT).map((r) => [squash(String((r as Record<string, unknown>).SECT_NAME)), r]))
  /* 앱 단면 성질(sectionProps — 이름 기준 Gen DB 값)과 연결되는 것만 비교: 형상·DB·DB 단면 이름·자료 형식·오프셋.
     전단변형·뒴 같은 해석 옵션은 Gen 이 그 설정으로 해석한 결과를 앱이 읽으므로 비교하지 않는다(엔지니어가 Gen 화면에서 만든 단면의 기본값이 앱과 달라도 받아들임) */
  const key = (r: Record<string, unknown>) => {
    const b = (r.SECT_BEFORE ?? {}) as Record<string, unknown>
    return { SECTTYPE: r.SECTTYPE, SHAPE: b.SHAPE, DATATYPE: b.DATATYPE, SECT_I: b.SECT_I, OFFSET_PT: b.OFFSET_PT, OFFSET_CENTER: b.OFFSET_CENTER, USER_OFFSET_REF: b.USER_OFFSET_REF,
      HORZ_OFFSET_OPT: b.HORZ_OFFSET_OPT, USERDEF_OFFSET_YI: b.USERDEF_OFFSET_YI, VERT_OFFSET_OPT: b.VERT_OFFSET_OPT, USERDEF_OFFSET_ZI: b.USERDEF_OFFSET_ZI }
  }
  const used = new Set(Object.values(gotElem).map((e) => String((e as Record<string, unknown>).SECT)))
  const options: string[] = []
  for (const sid of used) {
    const got = gotSect[sid] as Record<string, unknown> | undefined
    const exp = got && want.get(squash(String(got.SECT_NAME)))
    const d = exp ? dbDifferences('SECT', { [sid]: key(exp as Record<string, unknown>) }, { [sid]: key(got) }, 1) : [{ db: 'SECT', id: sid } as const]
    if (d.length) return { ok: false, reason: 'definition', detail: exp ? d.map(diffText).join(', ') : `SECT ${sid}` }
    const eb = (exp as Record<string, any>).SECT_BEFORE ?? {}, gb = (got as Record<string, any>).SECT_BEFORE ?? {}
    if (eb.USE_SHEAR_DEFORM !== gb.USE_SHEAR_DEFORM || eb.USE_WARPING_EFFECT !== gb.USE_WARPING_EFFECT) options.push(String(got!.SECT_NAME))
  }
  return { ok: true, spec: next, model: nextModel, changes, options }
}

/** 엔지니어 하중 모델의 그 자리 단면 갱신 — 앱이 만든 단면 표에, Gen 에 같은 이름 단면이 있으면 그 해석 옵션(전단변형·뒴)을 이어 쓴다
    (확인 화면 rb_sect_options 대로 Gen 설정 유지). TRUSS 요소가 쓰는 번호는 뒴 효과 끔(Gen 규칙). 같은 이름이 없는 새 단면은 앱 기본값 */
export function keepGenSectionOptions(sect: Record<string, unknown>, gen: Record<string, unknown> | undefined, elem: Record<string, unknown>): Record<string, unknown> {
  const opt = new Map<string, { USE_SHEAR_DEFORM?: unknown; USE_WARPING_EFFECT?: unknown }>()
  for (const g of Object.values(gen ?? {})) {
    const r = g as Record<string, any>
    if (r?.SECT_NAME && r.SECT_BEFORE) opt.set(squash(String(r.SECT_NAME)), { USE_SHEAR_DEFORM: r.SECT_BEFORE.USE_SHEAR_DEFORM, USE_WARPING_EFFECT: r.SECT_BEFORE.USE_WARPING_EFFECT })
  }
  const truss = new Set(Object.values(elem).filter((e) => (e as { TYPE?: string }).TYPE === 'TRUSS').map((e) => String((e as { SECT?: number }).SECT)))
  return Object.fromEntries(Object.entries(sect).map(([id, s]) => {
    const r = s as Record<string, any>, o = opt.get(squash(String(r.SECT_NAME)))
    if (!o || typeof o.USE_SHEAR_DEFORM !== 'boolean' || typeof o.USE_WARPING_EFFECT !== 'boolean') return [id, s]
    return [id, { ...r, SECT_BEFORE: { ...r.SECT_BEFORE, USE_SHEAR_DEFORM: o.USE_SHEAR_DEFORM, USE_WARPING_EFFECT: truss.has(id) ? false : o.USE_WARPING_EFFECT } }]
  }))
}
