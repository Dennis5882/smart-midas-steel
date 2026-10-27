/* Gen 에서 엔지니어가 넣은 하중 읽기 (F2 1단계, 순수) — docs/reference/gen-readback-scope.md.
   Gen DB(STLD·BODF·BMLD·CNLD·LCOM-GEN + 읽지 못하는 하중 표의 존재 여부)를 해석 전 확인 화면용 요약으로 바꾼다:
   케이스별 하중 형식·개수·합력(전역 방향 보·절점 하중은 정확, 자중은 앱 추정, 국부 방향·바닥 하중은 해석 후 반력으로),
   조합 표와 이상(없는 케이스 참조·계수 0·중복 이름·빈 조합), 누락 안내(풍·지진 케이스 없음 등). */
import type { ComboKind } from '../codes'
import { SYNC_DBS } from './genSync'
import type { LoadInfo } from './loads'
import { pedestalHeight, type FactoryModel, type FactorySpec } from './types'
import { nodeWeights } from './weights'

/** 읽어서 합산하는 하중 표 */
export const GEN_LOAD_DBS = ['STLD', 'BODF', 'BMLD', 'CNLD', 'LCOM-GEN'] as const
/** 내용을 합산하지 못하는 하중 표 — 있으면 '해석 후 반력으로 확인' 안내 (Wind Pressure 메뉴는 API 가 없어 존재도 알 수 없음) */
export const GEN_OPAQUE_DBS = ['FBLA', 'PRES', 'PNLA', 'SWIND', 'SSEIS', 'SDSP', 'ETMP', 'GTMP', 'BTMP', 'STMP', 'PSLT', 'MVLD', 'SPLC'] as const
export type GenOpaqueDb = typeof GEN_OPAQUE_DBS[number]
export const LOAD_SET: ReadonlySet<string> = new Set<string>(GEN_LOAD_DBS)
/** 형상 DB — 엔지니어 하중 모델의 동일성 확인 대상 (하중 표 제외) */
export const GEN_GEOMETRY_DBS = SYNC_DBS.filter((db) => !LOAD_SET.has(db))
/** 엔지니어 하중 모델에서 그대로여야 하는 표 — SECT·ELEM 은 단면 변경(Gen 에서 바꿈 = reviewGenSections, 앱이 바꿈 = updateSections)으로 따로 본다 */
export const GEN_FIXED_DBS = GEN_GEOMETRY_DBS.filter((db) => db !== 'SECT' && db !== 'ELEM')

export interface GenCase {
  name: string
  /** Gen 하중 종류 (D·L·LR·W·E·S·T… — Gen 그대로) */
  type: string
  desc: string
  /** 형식별 항목 수 */
  counts: { self: number; beam: number; nodal: number; local: number; moment: number }
  /** 합력 (kN, 전역) — 국부 방향 하중·읽지 못한 표가 섞이면 approx */
  sum: { fx: number; fy: number; fz: number }
  approx: boolean
}
export interface GenCombo {
  name: string
  parts: { lc: string; f: number; anal: string }[]
  /** seismicFactor — 이름 표시 없이 지진 계수 > 1 (증폭 지진인지 배율 지진인지 모름 → 일반으로 추정, 용도 확인 안내) */
  issues: ('unknownCase' | 'zeroFactor' | 'duplicate' | 'empty' | 'nonStatic' | 'seismicFactor')[]
  /** 앱이 추정한 용도 (2단계 — 확인 화면에서 엔지니어가 고침) */
  kind: ComboKind
}
export type GenLoadNotice = 'noWind' | 'noSeismic' | 'noLive' | 'noCombos' | 'unusedCase' | 'noLoads'
export interface GenLoadSummary {
  cases: GenCase[]
  combos: GenCombo[]
  /** 내용을 읽지 못한 하중 표(있는 것만) — 해석 후 케이스별 반력으로 크기 확인 */
  opaque: GenOpaqueDb[]
  notices: GenLoadNotice[]
  /** 조합에 쓰이지 않은 케이스 */
  unused: string[]
}

type Rec = Record<string, any>
const items = (t: Rec | undefined) => Object.entries(t ?? {}).flatMap(([id, r]) => ((r as Rec)?.ITEMS ?? []).map((it: Rec) => ({ id: +id, it })))

/** 보 하중 한 항목의 전역 합력 (kN) — UNILOAD 는 구간 선형 적분, CONLOAD 는 점하중. D 가 모두 ≤ 1 이면 상대 위치(경간 비)로 본다 */
function beamItemForce(it: Rec, L: number, proj: (dir: string) => number): number {
  const D: number[] = (it.D ?? []).map(Number), P: number[] = (it.P ?? []).map(Number)
  const rel = D.every((d) => d <= 1 + 1e-9)
  const len = it.USE_PROJECTION ? proj(it.DIRECTION) : L
  const x = (d: number) => (rel ? d * len : d * (len / L))
  if (it.TYPE === 'CONLOAD') return P.reduce((s, p) => s + p, 0) // 점하중 최대 4개 (뒤의 0 채움은 0)
  if (it.TYPE !== 'UNILOAD' && it.TYPE !== 'TRAPLOAD') return 0
  /* 정의된 점(앞에서부터 D 가 증가하는 동안)만 — 뒤의 0 채움은 끝 */
  let n = 1
  while (n < D.length && D[n] > D[n - 1]) n++
  let f = 0
  for (let i = 1; i < n; i++) f += ((P[i - 1] + P[i]) / 2) * (x(D[i]) - x(D[i - 1]))
  return f
}

/** Gen 하중 종류 — 지진은 E 만(EH·EV 토압·ER 등은 아님), 풍은 W 만(WP 수압 아님) */
const isSeismic = (type: string) => type === 'E'
const isWind = (type: string) => type === 'W'

/** 조합 용도 추정 (TW LRFD 2.2·13장·ASD 2.2 관례) — 이름에 ASD → asd, 증폭 지진은 이름에 ′·'·Ω 가 있을 때만 → amplified
    (계수만으로는 E′ = Ω·E 인지 배율을 곱한 지진인지 모름 — 증폭으로 보면 부재 강도 검토에서 빠지므로 일반으로 두고 seismicFactor 안내),
    D + 활하중(L·LR) 만이고 활하중 계수 ≤ 1(13.6.1 1.2D + 0.5L 또는 1.0L) → gravity, 그 밖 basic. 확인 화면에서 엔지니어가 고친다 */
export function guessComboKind(c: Pick<GenCombo, 'name' | 'parts'>, typeOf: (lc: string) => string): ComboKind {
  if (/ASD/i.test(c.name)) return 'asd'
  const st = c.parts.filter((p) => p.anal === 'ST')
  if (/[′'Ω]/.test(c.name)) return 'amplified'
  /* 중력: D + 활하중(L·LR — 활하중 케이스가 없으면 앱도 LR 로 씀)만, 활하중 계수 ≤ 1 (강도 조합 2.2-2 는 1.6) 또는 이름에 13.6 */
  const live = st.filter((p) => /^(L|LR)$/.test(typeOf(p.lc)))
  if (/13\.6/.test(c.name) || (st.some((p) => typeOf(p.lc) === 'D') && live.length > 0 && st.every((p) => /^(D|L|LR)$/.test(typeOf(p.lc))) && live.every((p) => Math.abs(p.f) <= 1 + 1e-9))) return 'gravity'
  return 'basic'
}

export function summarizeGenLoads(spec: FactorySpec, model: FactoryModel, dbs: Partial<Record<string, Rec>>): GenLoadSummary {
  const nodes = new Map(model.nodes.map((n) => [n.id, n]))
  const geo = new Map(model.elements.map((e) => {
    const a = nodes.get(e.n1)!, b = nodes.get(e.n2)!
    const d = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z }
    return [e.id, { L: Math.hypot(d.x, d.y, d.z), d }]
  }))
  const cases = new Map<string, GenCase>()
  for (const c of Object.values(dbs.STLD ?? {}) as Rec[]) {
    if (!c?.NAME || cases.has(c.NAME)) continue
    cases.set(c.NAME, { name: c.NAME, type: String(c.TYPE ?? ''), desc: String(c.DESC ?? ''), counts: { self: 0, beam: 0, nodal: 0, local: 0, moment: 0 }, sum: { fx: 0, fy: 0, fz: 0 }, approx: false })
  }
  const caseOf = (name: string) => cases.get(name)
  /* 자중 — 앱 강재 단면적 × γ (+ RC 받침) 추정. 실제 값은 해석 후 반력 */
  const steel = [...nodeWeights(spec, model, () => 0).values()].reduce((s, w) => s + w, 0)
  const ped = model.pedestals?.length && spec.pedestal ? model.pedestals.length * (spec.pedestal.b / 1000) * (spec.pedestal.d / 1000) * pedestalHeight(spec) * 24 : 0
  for (const b of Object.values(dbs.BODF ?? {}) as Rec[]) {
    const c = caseOf(b?.LCNAME)
    if (!c) continue
    const fv: number[] = (b.FV ?? [0, 0, 0]).map(Number), W = steel + ped
    c.counts.self++; c.sum.fx += fv[0] * W; c.sum.fy += fv[1] * W; c.sum.fz += fv[2] * W
  }
  for (const { id, it } of items(dbs.BMLD)) {
    const c = caseOf(it.LCNAME), g = geo.get(id)
    if (!c) continue
    if (/MOMENT/.test(String(it.TYPE))) { c.counts.moment++; continue }
    if (!g) { c.approx = true; continue }
    const dir = String(it.DIRECTION)
    if (!/^G[XYZ]$/.test(dir)) { c.counts.local++; c.approx = true; continue }
    c.counts.beam++
    const proj = (d: string) => Math.hypot(d === 'GX' ? 0 : g.d.x, d === 'GY' ? 0 : g.d.y, d === 'GZ' ? 0 : g.d.z)
    const f = beamItemForce(it, g.L, proj)
    if (dir === 'GX') c.sum.fx += f; else if (dir === 'GY') c.sum.fy += f; else c.sum.fz += f
  }
  for (const { it } of items(dbs.CNLD)) {
    const c = caseOf(it.LCNAME)
    if (!c) continue
    c.counts.nodal++; c.sum.fx += Number(it.FX ?? 0); c.sum.fy += Number(it.FY ?? 0); c.sum.fz += Number(it.FZ ?? 0)
  }
  const opaque = GEN_OPAQUE_DBS.filter((n) => Object.keys(dbs[n] ?? {}).length > 0)
  /* 바닥·면·압력 하중이 있으면 그 케이스의 합력은 근사 — 어느 케이스인지 모르는 표(SWIND 등)는 아래 안내만 */
  for (const n of ['FBLA', 'PRES', 'PNLA'] as const) for (const { it } of items(dbs[n])) { const c = caseOf(it.LCNAME ?? it.FLOOR_LOAD_TYPE_NAME); if (c) c.approx = true }

  const seen = new Set<string>(), combos: GenCombo[] = []
  for (const r of Object.values(dbs['LCOM-GEN'] ?? {}) as Rec[]) {
    if (!r?.NAME) continue
    const parts = ((r.vCOMB ?? []) as Rec[]).map((p) => ({ lc: String(p.LCNAME), f: Number(p.FACTOR), anal: String(p.ANAL ?? 'ST') }))
    const issues: GenCombo['issues'] = []
    if (seen.has(r.NAME)) issues.push('duplicate')
    seen.add(r.NAME)
    if (!parts.length) issues.push('empty')
    /* 조합 안의 다른 조합(ANAL 'CB')·이동하중 등은 정적 케이스가 아님 */
    if (parts.some((p) => p.anal !== 'ST')) issues.push('nonStatic')
    if (parts.some((p) => p.anal === 'ST' && !cases.has(p.lc))) issues.push('unknownCase')
    if (parts.some((p) => !(Math.abs(p.f) > 0))) issues.push('zeroFactor')
    combos.push({ name: r.NAME, parts, issues, kind: 'basic' })
  }
  const typeOf = (lc: string) => cases.get(lc)?.type ?? ''
  for (const c of combos) {
    c.kind = guessComboKind(c, typeOf)
    if (c.kind !== 'amplified' && c.parts.some((p) => p.anal === 'ST' && isSeismic(typeOf(p.lc)) && Math.abs(p.f) > 1 + 1e-9)) c.issues.push('seismicFactor')
  }
  const used = new Set(combos.flatMap((c) => c.parts.map((p) => p.lc)))
  const list = [...cases.values()]
  const unused = list.filter((c) => !used.has(c.name)).map((c) => c.name)
  const has = (re: RegExp) => list.some((c) => re.test(c.type))
  const notices: GenLoadNotice[] = []
  const loaded = list.some((c) => c.type !== 'D' && (c.counts.beam + c.counts.nodal + c.counts.local + c.counts.moment > 0)) || opaque.length > 0
  if (!loaded) notices.push('noLoads')
  if (!list.some((c) => isWind(c.type)) && !opaque.includes('SWIND')) notices.push('noWind')
  if (!list.some((c) => isSeismic(c.type)) && !opaque.includes('SSEIS')) notices.push('noSeismic')
  if (!has(/^(L|LR)$/)) notices.push('noLive')
  if (!combos.length) notices.push('noCombos')
  if (unused.length && combos.length) notices.push('unusedCase')
  return { cases: list, combos, opaque, notices, unused }
}

/** 안내만 하는 조합 이상 (확정 가능) */
export const WARN_ISSUES: ReadonlySet<GenCombo['issues'][number]> = new Set(['zeroFactor', 'seismicFactor'])
/** 조합에 이상이 있어 해석·검토를 진행할 수 없는가 (빈 조합·없는 케이스·중복 이름·정적 아님) */
export const blockingComboIssues = (s: GenLoadSummary) => s.combos.filter((c) => c.issues.some((i) => !WARN_ISSUES.has(i)))

const horizontalDir = (c: GenCase): 'X' | 'Y' => (Math.abs(c.sum.fx) >= Math.abs(c.sum.fy) ? 'X' : 'Y')

/** 엔지니어 하중으로 해석·검토할 때의 하중 정보 — 앱 값(퍼린·거트 국부 검토용 roofLive·qh 등)은 유지하고
    조합 용도는 요약의 kind(확인 화면에서 엔지니어가 정한 것을 호출부가 합쳐 넘김 — 처음 값은 앱 추정 guessComboKind),
    풍 변위각은 W 종류 케이스 각각(방향 = 수평 합력이 큰 축), 지붕 처짐은 L·LR 종류 케이스, 지진 변위각은 E 종류 케이스(앱이 V 인지 V* 인지 모름 → 검토 안 함) */
export function genLoadInfo(app: LoadInfo, s: GenLoadSummary): LoadInfo {
  const wind = s.cases.filter((c) => isWind(c.type))
  const kindOf = (c: GenCombo) => c.kind
  /* Ω (방향별) = 증폭 지진 조합의 E 종류 계수 절댓값 최대 — 계산서 13장 표시용 */
  const dirOf = new Map(s.cases.filter((c) => isSeismic(c.type)).map((c) => [c.name, horizontalDir(c)]))
  const omega = { X: 1, Y: 1 }
  for (const c of s.combos) if (kindOf(c) === 'amplified') for (const p of c.parts) { const d = dirOf.get(p.lc); if (d) omega[d] = Math.max(omega[d], Math.abs(p.f)) }
  return {
    ...app,
    additions: undefined,
    comboKind: Object.fromEntries(s.combos.map((c) => [c.name, kindOf(c)])),
    omega,
    wind: { ...app.wind, variants: wind.map((c) => ({ tag: c.name, dir: horizontalDir(c), parts: [{ lc: c.name, f: 1 }] })) },
    gen: {
      liveCases: s.cases.filter((c) => c.type === 'LR' || c.type === 'L').map((c) => c.name),
      seismicCases: s.cases.filter((c) => isSeismic(c.type)).map((c) => ({ name: c.name, dir: horizontalDir(c) })),
    },
  }
}
