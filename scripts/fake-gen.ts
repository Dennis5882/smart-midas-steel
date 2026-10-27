/* 오프라인 회귀용 가짜 Gen 표 — post/TABLE 응답을 앱 결과(Results)·보낸 DB 에서 만든다.
   verify-results(형식 오염)·verify-job(전송·단면 성질)·verify-opt-reuse(최적화 흐름)가 공유 — 결과 표 형식이 바뀌면 여기만 고친다. */
import type { Results } from '../src/actions/results'
import { genSectionRecord } from '../src/domain/sections'

/** 결과 표 종류 — U = 처마 조합 변위(B2·지문), S = 사용 하중 변위 */
export type ResultTableKind = 'BEAMFORCE' | 'TRUSSFORCE' | 'REACTIONG' | 'U' | 'S'

/** 정답 세트에 없는 이름(케이스 결과 — 앱이 순정 모드에서 케이스(ST)를 읽어 조합)은 첫 조합 값 × CASE_SCALE 로 합성한다.
    흐름 시험용 값(조합 = 앱이 계수로 합한 값) — 수치 대조는 라이브(live-results-speed.ts) */
const CASE_SCALE = 1 / 8
function pick<T>(m: Map<string, T>, c: string, scale: (v: T, k: number) => T): T {
  const v = m.get(c)
  return v !== undefined ? v : scale(m.values().next().value as T, CASE_SCALE)
}
const scalePts = (v: { P: number; Vy: number; Vz: number; My: number; Mz: number }[], k: number) => v.map((p) => ({ P: p.P * k, Vy: p.Vy * k, Vz: p.Vz * k, My: p.My * k, Mz: p.Mz * k }))
const scaleSway = (v: Record<'X' | 'Y', { sumPu: number; drift: number; sumH: number }>, k: number) =>
  ({ X: { sumPu: v.X.sumPu * k, drift: v.X.drift * k, sumH: v.X.sumH * k }, Y: { sumPu: v.Y.sumPu * k, drift: v.Y.drift * k, sumH: v.Y.sumH * k } })

/** 결과 표 응답 — edit 로 행을 오염시켜 파서 검증을 시험한다. 결과 표가 아니면 null */
export function resultTable(results: Results, a: any, edit?: (kind: ResultTableKind, data: unknown[][]) => void): Record<string, unknown> | null {
  const type = a.TABLE_TYPE as string, name = a.TABLE_NAME as string
  const keys = (a.NODE_ELEMS?.KEYS ?? []) as number[], loads = ((a.LOAD_CASE_NAMES ?? []) as string[]).map((c) => c.replace(/\((CB|ST)\)$/, ''))
  const data: unknown[][] = []
  let kind: ResultTableKind
  if (type === 'BEAMFORCE') {
    kind = 'BEAMFORCE'
    for (const id of keys) for (const c of loads) for (const [i, p] of pick(results.beam.get(id)!, c, scalePts).entries()) data.push(['0', String(id), c, ['I[1]', '1/4', '2/4', '3/4', 'J[2]'][i], p.P, p.Vy, p.Vz, p.My, p.Mz])
  } else if (type === 'TRUSSFORCE') {
    kind = 'TRUSSFORCE'
    for (const id of keys) for (const c of loads) { const f = pick(results.truss.get(id)!, c, (v, k) => v * k); data.push(['0', id, c, f, f]) }
  } else if (type === 'REACTIONG' && name !== 'Reaction') {
    for (const c of loads) { const s = pick(results.sway, c, scaleSway); data.push([c, s.X.sumH, s.Y.sumH, s.X.sumPu]) }
    edit?.('REACTIONG', data)
    return { [name]: { SUB_TABLES: [{ 'SUMMATION OF REACTION FORCES PRINTOUT': { DATA: data } }] } }
  } else if (type === 'DISPLACEMENTG' && name === 'U') {
    kind = 'U'
    for (const id of keys) for (const c of loads) { const s = pick(results.sway, c, scaleSway); data.push(['0', id, c, s.X.drift, s.Y.drift, 0]) }
  } else if (type === 'DISPLACEMENTG') {
    kind = 'S'
    for (const id of keys) for (const c of loads) { const v = results.disp.get(c)!.get(id)!; data.push(['0', id, c, v.dx, v.dy, v.dz]) }
  } else return null
  edit?.(kind, data)
  return { [name]: { HEAD: [], DATA: data } }
}

/** SECTIONALL — 보낸 SECT 의 Gen 단면 성질 (bump 를 더하면 출처 불일치 시험) */
export function sectionAllTable(sect: Record<string, any> | undefined, name: string, codeOf: (sectionName: string) => 'TW' | 'CN' | 'KR' = () => 'TW', bump = 0): Record<string, unknown> {
  const rows = Object.entries(sect ?? {}).map(([id, s]) => {
    const n = s.SECT_BEFORE.SECT_I.SECT_NAME as string
    const r = genSectionRecord(n, codeOf(n)) ?? genSectionRecord(n, 'TW')!
    return [id, String(r.A + bump), String(r.Ix), String(r.Iy), String(r.J)]
  })
  return { [name]: { DIST: 'MM', HEAD: ['ID', 'Area', 'Iyy', 'Izz', 'Ixx'], DATA: rows } }
}
