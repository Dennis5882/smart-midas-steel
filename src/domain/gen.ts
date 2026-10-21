/* 형상 모델 → Gen NX MAPI 페이로드 (순수 함수). 단위 m, kN (Gen 모델 단위계는 전송 전 db/UNIT 으로 맞춘다). */
import { profileOf } from '../codes'
import type { ElementRole, FactoryModel, FactorySpec } from './types'
import { isAxialRole, isBaseNode, pedestalElastic } from './types'

export interface GenPayloads {
  UNIT: Record<string, unknown>
  MATL: Record<string, unknown>
  SECT: Record<string, unknown>
  NODE: Record<string, unknown>
  ELEM: Record<string, unknown>
  CONS: Record<string, unknown>
  FRLS: Record<string, unknown>
}

/* 요소 국부축 회전각(beta). 거트·풍주는 강축이 벽면에 수직(풍압 방향)이 되도록 90°. 퍼린은 경사 지붕 면 정렬 생략(0°). */
const ANGLE: Partial<Record<ElementRole, number>> = { girt: 90, post: 90 }
/** 양단 핀(My·Mz 해제, 비틀림은 연결해 불안정 방지) — 단순보로 거동하는 2차부재 */
const PINNED_BOTH: ElementRole[] = ['purlin', 'girt', 'strut']
const PIN = '0000110', FIX = '0000000'

/** Gen 으로 보내는 DB 단면 이름 — Z 는 같은 치수 립 C */
export const genProxy = (name: string) => name.trim().startsWith('Z ') ? 'CC ' + name.trim().slice(2) : name

/* 퍼린·거트 재료를 따로 (CN Q235B · KR SS275 · TW 2차 재료) */
const twoMatOf = (spec: FactorySpec) => spec.code === 'CN' || spec.code === 'KR' || (spec.code === 'TW' && !!spec.secondaryMaterial && spec.secondaryMaterial !== spec.material)

export function buildGenPayloads(spec: FactorySpec, model: FactoryModel): GenPayloads {
  const prof = profileOf(spec.code)
  const mat = prof.materials[spec.material]
  if (!mat) throw new Error(`unknown material: ${spec.material}`)

  /* 퍼린·거트 재료를 따로 (CN Q235B · KR SS275) */
  const twoMat = twoMatOf(spec)
  const secondary = spec.secondaryMaterial ?? (spec.code === 'KR' ? 'SS275' : spec.code === 'CN' ? 'Q235B' : spec.material)

  /* 단면: 사용된 이름을 등장 순서대로 번호 부여 */
  const sectId = new Map<string, number>()
  for (const e of model.elements) if (!sectId.has(e.section)) sectId.set(e.section, sectId.size + 1)

  /* TRUSS 요소에 쓰는 단면은 뒴(7번째 자유도) 옵션 불가 — "Section property considering 7th DOF ... only to the beam elements" (라이브 2026-10-15) */
  const trussSects = new Set(model.elements.filter((e) => isAxialRole(e.role)).map((e) => e.section))
  const SECT: Record<string, unknown> = {}
  for (const [name, id] of sectId) {
    SECT[id] = {
      SECTTYPE: 'DBUSER',
      SECT_NAME: name.replace(/ /g, ''),
      /* Gen DB 에 Z 없음 → 같은 치수 립 C 를 해석 대리 단면으로 (양단 핀이라 부재력 동일, A·Ix·J 동일 — Iy 만 다름, twZSections 참조) */
      SECT_BEFORE: {
        OFFSET_PT: 'CC', OFFSET_CENTER: 0, USER_OFFSET_REF: 0,
        HORZ_OFFSET_OPT: 0, USERDEF_OFFSET_YI: 0, VERT_OFFSET_OPT: 0, USERDEF_OFFSET_ZI: 0,
        USE_SHEAR_DEFORM: true, USE_WARPING_EFFECT: !trussSects.has(name),
        SHAPE: prof.gen.shapeOf(genProxy(name)),
        DATATYPE: 1,
        SECT_I: { DB_NAME: prof.gen.sectionDbOf?.(genProxy(name)) ?? prof.gen.sectionDb, SECT_NAME: genProxy(name) },
      },
    }
  }

  const NODE: Record<string, unknown> = {}
  for (const n of model.nodes) NODE[n.id] = { X: n.x, Y: n.y, Z: n.z }
  /* RC 받침 (2단계): 기초 절점 + 받침 요소 — 재료·단면 번호는 강재 다음 */
  const peds = model.pedestals ?? []
  const pedMat = twoMatOf(spec) ? 3 : 2, pedSect = sectId.size + 1
  for (const p of peds) NODE[p.bottom.id] = { X: p.bottom.x, Y: p.bottom.y, Z: p.bottom.z }
  if (peds.length) SECT[pedSect] = {
    SECTTYPE: 'DBUSER', SECT_NAME: `RC${spec.pedestal!.b}x${spec.pedestal!.d}`,
    SECT_BEFORE: { OFFSET_PT: 'CC', OFFSET_CENTER: 0, USER_OFFSET_REF: 0, HORZ_OFFSET_OPT: 0, USERDEF_OFFSET_YI: 0, VERT_OFFSET_OPT: 0, USERDEF_OFFSET_ZI: 0,
      USE_SHEAR_DEFORM: true, USE_WARPING_EFFECT: false, SHAPE: 'SB', DATATYPE: 2, /* Gen 은 vSIZE 를 10칸으로 채워 돌려줌(라이브 2026-10-21) — 전송 확인이 같게 보도록 처음부터 10칸 */
      SECT_I: { vSIZE: [spec.pedestal!.b / 1000, spec.pedestal!.d / 1000, 0, 0, 0, 0, 0, 0, 0, 0] } },
  }

  const ELEM: Record<string, unknown> = {}
  for (const e of model.elements) {
    ELEM[e.id] = { TYPE: isAxialRole(e.role) ? 'TRUSS' : 'BEAM', MATL: twoMat && (e.role === 'purlin' || e.role === 'girt') ? 2 : 1, SECT: sectId.get(e.section), NODE: [e.n1, e.n2], ANGLE: e.addition ? 0 : ANGLE[e.role] ?? 0 }
  }
  /* 받침 국부축 각도 0 — vSIZE [b, d] 의 b 가 골조면(X) 방향 춤 (강철 기둥 강축과 같은 방향) */
  for (const p of peds) ELEM[p.elem] = { TYPE: 'BEAM', MATL: pedMat, SECT: pedSect, NODE: [p.bottom.id, p.top], ANGLE: 0 }

  /* 단부 해제: 2차부재 양단 핀, 풍주는 지붕보에 닿는 상단만 핀(기초는 핀 지점이라 해제 불필요 — 양단 해제 시 기초 절점 회전 불안정) */
  const FRLS: Record<string, unknown> = {}
  const pedTops = new Set((model.pedestals ?? []).map((p) => p.top))
  const postStarts = new Set(model.elements.filter((e) => e.role === 'post').map((e) => e.n1))
  /* 흔들림 기둥(다경간 내부) 상단 = 지붕보에 핀 */
  const leanStarts = new Set(model.elements.filter((e) => e.lean).map((e) => e.n1))
  for (const e of model.elements) {
    if (e.addition && e.addition !== 'platform-column') {
      const group = model.elements.filter((v) => v.physicalKey === e.physicalKey)
      const end = (id: number) => group.filter((v) => v.n1 === id || v.n2 === id).length === 1
      const pinI = end(e.n1), pinJ = end(e.n2)
      if (pinI || pinJ) FRLS[e.id] = { ITEMS: [{ ID: 1, bVALUE: false, FLAG_I: pinI ? PIN : FIX, VALUE_I: [0, 0, 0, 0, 0, 0, 0], FLAG_J: pinJ ? PIN : FIX, VALUE_J: [0, 0, 0, 0, 0, 0, 0] }] }
      continue
    }
    if (e.addition === 'platform-column') continue
    const both = PINNED_BOTH.includes(e.role)
    const postTop = (e.role === 'post' && !postStarts.has(e.n2)) || (!!e.lean && !leanStarts.has(e.n2))
    /* RC 받침 위 핀 주각(핀 지정·흔들림 기둥): 지점 대신 강철 기둥 하단 회전 해제 — 받침 바닥은 기초에 고정 */
    const pinBase = pedTops.has(e.n1) && (e.role === 'column' || e.role === 'post') && (spec.baseFixity !== 'fixed' || !!e.lean)
    if (!both && !postTop && !pinBase) continue
    FRLS[e.id] = { ITEMS: [{ ID: 1, bVALUE: false, FLAG_I: both || pinBase ? PIN : FIX, VALUE_I: [0, 0, 0, 0, 0, 0, 0], FLAG_J: both || postTop ? PIN : FIX, VALUE_J: [0, 0, 0, 0, 0, 0, 0] }] }
  }

  const code = spec.baseFixity === 'fixed' ? '1111111' : '1110000'
  /* 흔들림 기둥 기초는 항상 핀 */
  const leanBase = new Set(model.elements.filter((e) => e.lean).map((e) => e.n1))
  const CONS: Record<string, unknown> = {}
  for (const n of model.nodes) {
    /* GROUP_NAME 은 미리 정의된 경계 그룹만 허용(없는 이름이면 Unknown Error, 라이브 확인) → 생략 */
    if (isBaseNode(model, n) && !pedTops.has(n.id)) CONS[n.id] = { ITEMS: [{ ID: n.id, CONSTRAINT: model.additions?.fixedBases.includes(n.id) ? '1111111' : leanBase.has(n.id) ? '1110000' : code }] }
  }

  const material = (name: string) => {
    const m = prof.materials[name]
    if (!m) throw new Error(`unknown material: ${name}`)
    return { TYPE: 'STEEL', NAME: name, DAMP_RAT: spec.code === 'CN' ? spec.china?.damping ?? 0.05 : 0.02, PARAM: [{ P_TYPE: 1, STANDARD: m.gen.standard, CODE: '', DB: m.gen.db, bELAST: false }] }
  }
  /* 받침 바닥 = 기초 고정 */
  for (const p of model.pedestals ?? []) CONS[p.bottom.id] = { ITEMS: [{ ID: p.bottom.id, CONSTRAINT: '1111111' }] }
  /* RC 받침 재료: 사용자 탄성(균열 0.7·Ec, ν 0.2, 24 kN/m³) — 앱은 RC 설계를 하지 않으므로 강성·자중만 */
  const pedMaterial = { TYPE: 'USER', NAME: `RC fc${spec.fc}`, HE_SPEC: 0, HE_COND: 0, PLMT: 0, P_NAME: '', bMASS_DENS: true, DAMP_RAT: 0.05,
    PARAM: [{ P_TYPE: 2, ELAST: pedestalElastic(spec.fc), POISN: 0.2, THERMAL: 1e-5, DEN: 24, MASS: 24 / 9.80665 }] }
  return {
    UNIT: { 1: { FORCE: 'KN', DIST: 'M', HEAT: 'KJ', TEMPER: 'C' } },
    MATL: { 1: material(spec.material), ...(twoMat ? { 2: material(secondary) } : {}), ...(peds.length ? { [pedMat]: pedMaterial } : {}) },
    SECT, NODE, ELEM, CONS, FRLS,
  }
}
