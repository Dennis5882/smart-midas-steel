/* 해석 결과 회수 (M2) — 설계 검토에 필요한 표를 Gen NX post/TABLE 에서 받아 파싱.
   - BEAMFORCE: 보 요소 × 하중조합(CB) × 5 지점(I, 1/4, 2/4, 3/4, J) — 라이브 410 요소·22 조합 ≈ 4.3만 행 / 11 s
   - TRUSSFORCE: 가새 축력
   - REACTIONG 합계 + DISPLACEMENTG 처마 절점: 조합별 B2 (8.2-5) 산정
   - DISPLACEMENTG 사용 하중(ST): 풍·지진 층간변위각, 지붕 활하중 처짐 */
import { isAxialRole } from '../domain/types'
import type { Built } from '../state/store'
import { mapi, tableOf } from '../mapi/client'
import { stage } from './job'
import { requireResult, resultNumber, ResultValidationError, serviceNodes, validateDesignResults } from '../domain/resultValidation'
import { S } from '../state/store'
import { lateralSwayKr } from '../domain/krSway'

export interface ForcePt { P: number; Vy: number; Vz: number; My: number; Mz: number }
export interface Results {
  /** 요소 → 조합 → 5 지점 */
  beam: Map<number, Map<string, ForcePt[]>>
  /** 가새 요소 → 조합 → 축력 (+ 인장) */
  truss: Map<number, Map<string, number>>
  /** 조합 → 방향별 B2 입력 */
  sway: Map<string, Record<'X' | 'Y', { sumPu: number; drift: number; sumH: number }>>
  /** 사용 하중 케이스 → 절점 → 변위 (m) */
  disp: Map<string, Map<number, { dx: number; dy: number; dz: number }>>
  combos: string[]
  /** 처마 절점 조합 변위 합(원시값) — 같은 해석의 결과인지 다시 확인할 때 비교 (KR 은 sway 를 고쳐 쓰므로 따로 보관) */
  fingerprint?: string
}

const num = (s: unknown) => resultNumber(s, 'TABLE')

async function table(type: string, name: string, keys: number[], loads: string[], extra: Record<string, unknown> = {}, components?: string[]) {
  const j = await mapi<any>('POST', '/post/TABLE', {
    Argument: {
      TABLE_NAME: name, TABLE_TYPE: type, UNIT: { FORCE: 'KN', DIST: 'M' }, STYLES: { FORMAT: 'Fixed', PLACE: 5 },
      ...(components ? { COMPONENTS: components } : {}),
      NODE_ELEMS: { KEYS: keys }, LOAD_CASE_NAMES: loads, ...extra,
    },
  }, `${type} · ${keys.length} × ${loads.length}`)
  const out = tableOf(j)
  requireResult(out && typeof out === 'object' && (Array.isArray(out.DATA) || Array.isArray(out.SUB_TABLES)), type, 'invalid', name)
  return out as { HEAD: string[]; DATA: string[][]; SUB_TABLES?: any[] }
}

const STATIONS = ['I', '1/4', '2/4', '3/4', 'J']

const caseBatchSize=(keys:number[],stations=1)=>Math.max(1,Math.floor(60000/Math.max(1,keys.length*stations)))
/** Bound each response without discarding any load cases or keeping raw tables together. */
async function* tableRows(type:string,name:string,keys:number[],loads:string[],components?:string[]) {
  const batch=caseBatchSize(keys)
  for(let offset=0;offset<loads.length;offset+=batch){
    const data=await table(type,name,keys,loads.slice(offset,offset+batch),{},components)
    requireResult(Array.isArray(data.DATA),type,'missing')
    for(const row of data.DATA)yield row
  }
}

/** 처마 절점 조합 변위 — B2 입력이자 결과 지문 */
async function eaveDisplacements(ids: number[], cb: string[], comboSet: Set<string>) {
  const dsum = new Map<string, number[]>()
  const seenU = new Set<string>()
  const eaveSet = new Set(ids)
  for await (const [, nd, lc, dx, dy, dz] of tableRows('DISPLACEMENTG','U',ids,cb,['Node', 'Load', 'DX', 'DY', 'DZ'])) {
    const key = `${lc}:${nd}`
    requireResult(eaveSet.has(+nd) && comboSet.has(lc) && !seenU.has(key), 'DISPLACEMENTG', seenU.has(key) ? 'duplicate' : 'unexpected', `${nd} · ${lc}`)
    seenU.add(key)
    const a = dsum.get(lc) ?? [0, 0, 0, 0]
    a[0] += num(dx); a[1] += num(dy); a[3] += num(dz); a[2]++
    dsum.set(lc, a)
  }
  return { dsum, seenU }
}

const fingerprint = (combos: string[], dsum: Map<string, number[]>) => combos.map((c) => (dsum.get(c) ?? []).join(',')).join(';')

/* 결과의 출처 — fetchResults 가 전체 검증을 통과한 결과에 기록(어느 경로에서 회수했든 같음), 부재·접합 검토까지 끝나면
   markChecked 가 재사용 가능 목록으로 옮긴다(검토 중 예외로 멈춘 결과는 재사용하지 않음). 같은 모델(S.built)·같은 해석 회차에서만 재사용 */
const fetched = new WeakMap<Results, { built: Built; rev: number }>()
const origin = new WeakMap<Results, { built: Built; rev: number }>()
/** 부재·접합 검토가 이 결과로 끝까지 실행됨 — 이후 최적화 1회차 재사용 후보 */
export function markChecked(r: Results): void {
  const src = fetched.get(r)
  if (src) origin.set(r, src)
}

/** 이전 결과를 다시 써도 되는지 — 같은 모델·같은 해석 회차 + Gen 의 처마 변위 지문이 같음
    (해석 제어·P-Δ 처럼 Gen 동일성 검사 밖의 설정을 바꿔 Gen 에서 다시 해석했으면 지문이 달라진다; 작은 표 하나).
    표를 못 읽거나 형식이 다르면(Gen 결과 삭제 등) 재사용하지 않고 새로 회수하게 null — 취소·통신 오류는 그대로 전달 */
export async function reusableResults(r: Results | null, b: Built, rev: number): Promise<Results | null> {
  const src = r && origin.get(r)
  if (!r?.fingerprint || !src || src.built !== b || src.rev !== rev) return null
  const cb = r.combos.map((c) => `${c}(CB)`)
  const { eaves } = serviceNodes(b.spec, b.model)
  stage('st_results', Math.ceil(cb.length / caseBatchSize(eaves.map((n) => n.id))))
  try {
    const { dsum } = await eaveDisplacements(eaves.map((n) => n.id), cb, new Set(r.combos))
    return fingerprint(r.combos, dsum) === r.fingerprint ? r : null
  } catch (e) {
    if (e instanceof ResultValidationError) return null
    throw e
  }
}

export async function fetchResults(b: Built): Promise<Results> {
  const { model, spec } = b
  const combos = b.comboNames
  requireResult(combos.length > 0 && new Set(combos).size === combos.length, 'COMBINATIONS', 'invalid')
  const cb = combos.map((c) => `${c}(CB)`)
  const beamIds = model.elements.filter((e) => !isAxialRole(e.role)).map((e) => e.id)
  const trussIds = model.elements.filter((e) => isAxialRole(e.role)).map((e) => e.id)
  const { eaves: eaveNodes, tops: columnTops, nodes: svcNodes } = serviceNodes(spec, model)
  const svcCases = b.cases.filter((c) => spec.code === 'CN' || !!b.info.additions || c !== 'D')
  /* 행 검증은 Set 조회 — 배열 includes 는 11만 행 × 410 요소로 화면 스레드에서 수천만 번 비교 */
  const comboSet = new Set(combos), beamSet = new Set(beamIds), trussSet = new Set(trussIds)

  /* 보 부재력 */
  const beam = new Map<number, Map<string, ForcePt[]>>()
  const batchSize = spec.code === 'CN' ? Math.min(4,caseBatchSize(beamIds,5)) : model.additions ? Math.min(16,caseBatchSize(beamIds,5)) : cb.length
  stage('st_results', Math.ceil(cb.length / batchSize) + (trussIds.length ? Math.ceil(cb.length/caseBatchSize(trussIds)) : 0) + 1 + Math.ceil(cb.length/caseBatchSize(eaveNodes.map(n=>n.id))) + Math.ceil(svcCases.length/caseBatchSize(svcNodes.map(n=>n.id))))
  for (let offset = 0; offset < cb.length; offset += batchSize) {
    const bf = await table('BEAMFORCE', spec.code === 'CN' ? `F${offset}` : 'F', beamIds, cb.slice(offset, offset + batchSize), { PARTS: ['PartI', 'Part1/4', 'Part2/4', 'Part3/4', 'PartJ'] },
      ['Elem', 'Load', 'Part', 'Axial', 'Shear-y', 'Shear-z', 'Moment-y', 'Moment-z'])
    requireResult(Array.isArray(bf.DATA) && bf.DATA.length > 0, 'BEAMFORCE', 'missing')
    /* push(...DATA) 금지 — TW 는 410×55×5 ≈ 11만 행이라 브라우저(크롬)에서 인자 펼치기가 스택 초과 (Node 는 통과해서 늦게 발견, 2026-10-15) */
    for (const r of bf.DATA) {
    const [, el, lc, part, P, Vy, Vz, My, Mz] = r
    const id = num(el), station = STATIONS.indexOf(String(part).trim().replace(/\[\d+\]$/, ''))
    requireResult(beamSet.has(id) && comboSet.has(lc) && station >= 0, 'BEAMFORCE', 'unexpected', `${el} · ${lc} · ${part}`)
    const m = beam.get(id) ?? new Map<string, ForcePt[]>()
    beam.set(id, m)
    const arr = m.get(lc) ?? []
    m.set(lc, arr)
    requireResult(!arr[station], 'BEAMFORCE', 'duplicate', `${el} · ${lc} · ${part}`)
    arr[station] = { P: num(P), Vy: num(Vy), Vz: num(Vz), My: num(My), Mz: num(Mz) }
    }
  }

  /* 가새 축력 — 인장 +, I·J 중 절댓값 큰 쪽 */
  const truss = new Map<number, Map<string, number>>()
  if (trussIds.length) {
    for await (const [, el, lc, fi, fj] of tableRows('TRUSSFORCE','T',trussIds,cb)) {
      const m = truss.get(+el) ?? new Map<string, number>()
      requireResult(trussSet.has(+el) && comboSet.has(lc) && !m.has(lc), 'TRUSSFORCE', m.has(lc) ? 'duplicate' : 'unexpected', `${el} · ${lc}`)
      truss.set(+el, m)
      m.set(lc, Math.abs(num(fi)) > Math.abs(num(fj)) ? num(fi) : num(fj))
    }
  }

  /* B2 입력 — 조합별 반력 합(ΣPu = ΣFZ, ΣH = |ΣFX|·|ΣFY|), 처마 절점(기둥 상단) 평균 변위 */
  const base = model.nodes.find((n) => n.z === 0)!
  const rx = await table('REACTIONG', 'R', [base.id], cb, {}, ['Node', 'Load', 'FX', 'FY', 'FZ'])
  const sums = new Map<string, number[]>()
  const reactionRows = rx.SUB_TABLES?.[0]?.['SUMMATION OF REACTION FORCES PRINTOUT']?.DATA
  requireResult(Array.isArray(reactionRows), 'REACTIONG', 'missing')
  for (const [lc, fx, fy, fz] of reactionRows as string[][]) {
    requireResult(comboSet.has(lc) && !sums.has(lc), 'REACTIONG', sums.has(lc) ? 'duplicate' : 'unexpected', lc)
    sums.set(lc, [num(fx), num(fy), num(fz)])
  }
  const { dsum, seenU } = await eaveDisplacements(eaveNodes.map((n) => n.id), cb, comboSet)
  const sway = new Map<string, Record<'X' | 'Y', { sumPu: number; drift: number; sumH: number }>>()
  for (const c of combos) {
    const s = sums.get(c), d = dsum.get(c)
    requireResult(s && d && d[2] === eaveNodes.length && eaveNodes.every((n) => seenU.has(`${c}:${n.id}`)), 'SWAY', 'missing', c)
    sway.set(c, {
      X: { sumPu: Math.abs(s[2]), drift: Math.abs(d[0] / d[2]), sumH: Math.abs(s[0]) },
      Y: { sumPu: Math.abs(s[2]), drift: Math.abs(d[1] / d[2]), sumH: Math.abs(s[1]) },
    })
  }

  /* 사용성 — 처마·마루 절점 변위 (사용 하중 케이스) */
  const disp = new Map<string, Map<number, { dx: number; dy: number; dz: number }>>()
  const svcCaseSet = new Set(svcCases), svcNodeSet = new Set(svcNodes.map((n) => n.id))
  for await (const [, nd, lc, dx, dy, dz] of tableRows('DISPLACEMENTG','S',svcNodes.map(n=>n.id),svcCases.map(c=>`${c}(ST)`),['Node', 'Load', 'DX', 'DY', 'DZ'])) {
    const m = disp.get(lc) ?? new Map()
    requireResult(svcCaseSet.has(lc) && svcNodeSet.has(+nd) && !m.has(+nd), 'DISPLACEMENTG', m.has(+nd) ? 'duplicate' : 'unexpected', `${nd} · ${lc}`)
    disp.set(lc, m)
    m.set(+nd, { dx: num(dx), dy: num(dy), dz: num(dz) })
  }
  for (const c of svcCases) for (const n of svcNodes) requireResult(disp.get(c)?.has(n.id), 'DISPLACEMENTG', 'missing', `${n.id} · ${c}`)
  const results: Results = { beam, truss, sway, disp, combos, fingerprint: fingerprint(combos, dsum) }
  if (spec.code === 'KR') lateralSwayKr(results, columnTops.map((n) => n.id), b.info.seismic)
  validateDesignResults(spec, model, b.info, results)
  fetched.set(results, { built: b, rev: S.analysisRev })
  return results
}
