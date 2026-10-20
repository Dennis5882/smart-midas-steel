/* 오프라인 회귀용 가짜 Gen 표 — post/TABLE 응답을 앱 결과(Results)·보낸 DB 에서 만든다.
   verify-results(형식 오염)·verify-job(전송·단면 성질)·verify-opt-reuse(최적화 흐름)가 공유 — 결과 표 형식이 바뀌면 여기만 고친다. */
import type { Results } from '../src/actions/results'
import { genSectionRecord } from '../src/domain/sections'

/** 결과 표 종류 — U = 처마 조합 변위(B2·지문), S = 사용 하중 변위 */
export type ResultTableKind = 'BEAMFORCE' | 'TRUSSFORCE' | 'REACTIONG' | 'U' | 'S'

/** 결과 표 응답 — edit 로 행을 오염시켜 파서 검증을 시험한다. 결과 표가 아니면 null */
export function resultTable(results: Results, a: any, edit?: (kind: ResultTableKind, data: unknown[][]) => void): Record<string, unknown> | null {
  const type = a.TABLE_TYPE as string, name = a.TABLE_NAME as string
  const keys = (a.NODE_ELEMS?.KEYS ?? []) as number[], loads = ((a.LOAD_CASE_NAMES ?? []) as string[]).map((c) => c.replace(/\((CB|ST)\)$/, ''))
  const data: unknown[][] = []
  let kind: ResultTableKind
  if (type === 'BEAMFORCE') {
    kind = 'BEAMFORCE'
    for (const id of keys) for (const c of loads) for (const [i, p] of results.beam.get(id)!.get(c)!.entries()) data.push(['0', String(id), c, ['I[1]', '1/4', '2/4', '3/4', 'J[2]'][i], p.P, p.Vy, p.Vz, p.My, p.Mz])
  } else if (type === 'TRUSSFORCE') {
    kind = 'TRUSSFORCE'
    for (const id of keys) for (const c of loads) data.push(['0', id, c, results.truss.get(id)!.get(c), results.truss.get(id)!.get(c)])
  } else if (type === 'REACTIONG' && name !== 'Reaction') {
    for (const c of loads) { const s = results.sway.get(c)!; data.push([c, s.X.sumH, s.Y.sumH, s.X.sumPu]) }
    edit?.('REACTIONG', data)
    return { [name]: { SUB_TABLES: [{ 'SUMMATION OF REACTION FORCES PRINTOUT': { DATA: data } }] } }
  } else if (type === 'DISPLACEMENTG' && name === 'U') {
    kind = 'U'
    for (const id of keys) for (const c of loads) { const s = results.sway.get(c)!; data.push(['0', id, c, s.X.drift, s.Y.drift, 0]) }
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
