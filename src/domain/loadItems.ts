/* Gen 하중 항목(db/CNLD·db/BMLD) — 앱의 모든 절점·보 하중 항목은 여기서 만든다.
   - 필드는 항상 모두: 항목이 있는 레코드에 PUT 하면 Gen 은 빠진 필드를 첫 항목 값으로 조용히 채운다 (midas-nx 2.10.4 변경 기록 —
     그 자리 갱신이 엔지니어가 첫 항목에 넣은 편심·추가 값을 앱 항목에 복사하지 않게, 동일성 검사도 이 필드를 비교하게)
   - 한 절점·같은 케이스 절점 하중은 합산해 하나로: 둘이면 Gen 은 하나만 남긴다 (라이브 2026-10-16) */

export type NodalForce = Partial<Record<'FX' | 'FY' | 'FZ' | 'MX' | 'MY' | 'MZ', number>>
export type NodalItem = { ID: number; LCNAME: string; GROUP_NAME: string; FX: number; FY: number; FZ: number; MX: number; MY: number; MZ: number }
const COMPONENTS = ['FX', 'FY', 'FZ', 'MX', 'MY', 'MZ'] as const

/** 절점 node 의 케이스 lc 항목에 f 를 더한다 (없으면 새 항목, 모두 0 이면 만들지 않음). 숫자가 아닌 성분은 오류 — 0 으로 바꿔 보내지 않는다 */
export function addNodalLoad(cnld: Record<string, unknown>, node: number, lc: string, f: NodalForce): void {
  for (const k of COMPONENTS) if (f[k] !== undefined && !Number.isFinite(f[k])) throw new Error(`invalid nodal load ${k} at node ${node} (${lc})`)
  const items = (cnld[node] as { ITEMS: NodalItem[] } | undefined)?.ITEMS
  let item = items?.find((it) => it.LCNAME === lc)
  if (!item) {
    if (COMPONENTS.every((k) => !f[k])) return
    const list = ((cnld[node] ??= { ITEMS: [] }) as { ITEMS: NodalItem[] }).ITEMS
    item = { ID: list.length + 1, LCNAME: lc, GROUP_NAME: '', FX: 0, FY: 0, FZ: 0, MX: 0, MY: 0, MZ: 0 }
    list.push(item)
  }
  for (const k of COMPONENTS) item[k] += f[k] ?? 0
}

export type BeamDir = 'GX' | 'GY' | 'GZ' | 'LX' | 'LY' | 'LZ'
/** 보 elem 에 케이스 lc 의 전 길이 등분포 하중 w (kN/m) — 추가 하중(ADDITIONAL)은 끈 값까지 명시 (Gen 이 항상 돌려주는 필드).
    편심 값(ECCEN_TYPE·I_END·USE_J_END·J_END)은 보내지 않는다 — USE_ECCEN:false 면 Gen 이 저장하지도 돌려주지도 않는다 (라이브 2026-10-28) */
export function addBeamLoad(bmld: Record<string, unknown>, elem: number, lc: string, dir: BeamDir, w: number): void {
  if (!Number.isFinite(w)) throw new Error(`invalid beam load at element ${elem} (${lc})`)
  const items = ((bmld[elem] ??= { ITEMS: [] }) as { ITEMS: unknown[] }).ITEMS
  items.push({
    ID: items.length + 1, LCNAME: lc, GROUP_NAME: '', CMD: 'BEAM', TYPE: 'UNILOAD', DIRECTION: dir, USE_PROJECTION: false,
    USE_ECCEN: false, USE_ADDITIONAL: false, ADDITIONAL_I_END: 0, USE_ADDITIONAL_J_END: false, ADDITIONAL_J_END: 0,
    D: [0, 1, 0, 0], P: [w, w, 0, 0],
  })
}
