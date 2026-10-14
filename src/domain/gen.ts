/* 형상 모델 → Gen NX MAPI 페이로드 (순수 함수). 단위 m, kN (Gen 모델 단위계는 전송 전 db/UNIT 으로 맞춘다). */
import { profileOf } from '../codes'
import type { ElementRole, FactoryModel, FactorySpec } from './types'

export interface GenPayloads {
  UNIT: Record<string, unknown>
  MATL: Record<string, unknown>
  SECT: Record<string, unknown>
  NODE: Record<string, unknown>
  ELEM: Record<string, unknown>
  CONS: Record<string, unknown>
}

/* 요소 국부축 회전각(beta). 거트는 웹이 수평(전역 X)이 되도록 90°. 퍼린은 경사 지붕 면 정렬을 M1 에서는 생략(0°). */
const ANGLE: Partial<Record<ElementRole, number>> = { girt: 90 }

export function buildGenPayloads(spec: FactorySpec, model: FactoryModel): GenPayloads {
  const prof = profileOf(spec.code)
  const mat = prof.materials[spec.material]
  if (!mat) throw new Error(`unknown material: ${spec.material}`)

  /* 단면: 사용된 이름을 등장 순서대로 번호 부여 */
  const sectId = new Map<string, number>()
  for (const e of model.elements) if (!sectId.has(e.section)) sectId.set(e.section, sectId.size + 1)

  const SECT: Record<string, unknown> = {}
  for (const [name, id] of sectId) {
    SECT[id] = {
      SECTTYPE: 'DBUSER',
      SECT_NAME: name.replace(/ /g, ''),
      SECT_BEFORE: {
        OFFSET_PT: 'CC', OFFSET_CENTER: 0, USER_OFFSET_REF: 0,
        HORZ_OFFSET_OPT: 0, USERDEF_OFFSET_YI: 0, VERT_OFFSET_OPT: 0, USERDEF_OFFSET_ZI: 0,
        USE_SHEAR_DEFORM: true, USE_WARPING_EFFECT: true,
        SHAPE: prof.gen.shapeOf(name),
        DATATYPE: 1,
        SECT_I: { DB_NAME: prof.gen.sectionDb, SECT_NAME: name },
      },
    }
  }

  const NODE: Record<string, unknown> = {}
  for (const n of model.nodes) NODE[n.id] = { X: n.x, Y: n.y, Z: n.z }

  const ELEM: Record<string, unknown> = {}
  for (const e of model.elements) {
    ELEM[e.id] = { TYPE: 'BEAM', MATL: 1, SECT: sectId.get(e.section), NODE: [e.n1, e.n2], ANGLE: ANGLE[e.role] ?? 0 }
  }

  const code = spec.baseFixity === 'fixed' ? '1111111' : '1110000'
  const CONS: Record<string, unknown> = {}
  for (const n of model.nodes) {
    /* GROUP_NAME 은 미리 정의된 경계 그룹만 허용(없는 이름이면 Unknown Error, 라이브 확인) → 생략 */
    if (n.z === 0) CONS[n.id] = { ITEMS: [{ ID: n.id, CONSTRAINT: code }] }
  }

  return {
    UNIT: { 1: { FORCE: 'KN', DIST: 'M', HEAT: 'KJ', TEMPER: 'C' } },
    MATL: { 1: { TYPE: 'STEEL', NAME: spec.material, DAMP_RAT: 0.02, PARAM: [{ P_TYPE: 1, STANDARD: mat.gen.standard, CODE: '', DB: mat.gen.db, bELAST: false }] } },
    SECT, NODE, ELEM, CONS,
  }
}
