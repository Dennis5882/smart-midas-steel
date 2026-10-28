import type { FactoryModel, FactorySpec } from './types'
import type { LoadPayloads } from './loads'
import { activeCrane, activePlatform, additionErrors } from './additions'
import { addBeamLoad, addNodalLoad } from './loadItems'

/** Source loads are summed by (node, case): Gen keeps only one CNLD entry per case/node. */
export function buildAdditionLoads(s: FactorySpec, m: FactoryModel, load: LoadPayloads): LoadPayloads {
  const a = m.additions
  if (!a) return load
  const errors = additionErrors(s)
  if (errors.length) throw new Error(`Unconfirmed/invalid additions: ${errors.map((e) => e.path).join(', ')}`)
  for (const n of a.nodal) {
    /* 성분이 빠진 옛 저장 데이터는 0 으로 보내지 않고 실패 (addNodalLoad 는 빠진 성분을 0 으로 본다) */
    if ((['fx', 'fy', 'fz', 'mx', 'my', 'mz'] as const).some((k) => typeof n[k] !== 'number')) throw new Error(`invalid nodal load at node ${n.node} (${n.case})`)
    addNodalLoad(load.CNLD, n.node, n.case, { FX: n.fx, FY: n.fy, FZ: n.fz, MX: n.mx, MY: n.my, MZ: n.mz })
  }
  for (const b of a.beam) {
    if (!b.q) continue
    addBeamLoad(load.BMLD, b.element, b.case, 'GZ', -b.q)
  }
  let sid = Object.keys(load.STLD).length, cid = Object.keys(load['LCOM-GEN']).length
  const combinationBasis:Record<string,string>={}
  const addCase = (NAME: string, TYPE: string) => { load.STLD[++sid] = { NAME, TYPE, DESC: 'Project additions' } }
  const combo = (NAME: string, parts: [string, number][]) => {
    load['LCOM-GEN'][++cid] = { NAME, ACTIVE: 'ACTIVE', iTYPE: 0, DESC: 'Project-confirmed addition factors; preliminary static effects', vCOMB: parts.filter(([, f]) => f !== 0).map(([LCNAME, FACTOR]) => ({ ANAL: 'ST', LCNAME, FACTOR })) }
    load.info.comboKind[NAME] = 'basic'
    combinationBasis[NAME]=parts.filter(([,f])=>f!==0).map(([lc,f])=>`${f} ${lc}`).join(' + ')
  }
  const p = activePlatform(s), c = activeCrane(s), f = s.additions!.factors
  if (p) {
    addCase('PL', 'L')
    // Retain zero-live alternatives: live load may stabilize uplift or reverse a member moment.
    const original = Object.values(load['LCOM-GEN']) as any[]
    if (f.accompanyingLive) for (const [i,v] of original.entries()) {
      const tags=[...new Set(v.vCOMB.map((p:any)=>String(p.LCNAME).match(/^(WX|WY|EX|EY|EV|NX|NY)/)?.[1]).filter(Boolean))]
      const NAME=`AP${String(i+1).padStart(3,'0')}${tags.length?' '+tags.join(' '):''}`
      if(NAME.length>20)throw new Error('Addition combination name exceeds Gen limit')
      load['LCOM-GEN'][++cid]={...v,NAME,DESC:`${v.NAME} + project accompanying PL`,vCOMB:[...v.vCOMB,{ANAL:'ST',LCNAME:'PL',FACTOR:f.accompanyingLive}]}
      load.info.comboKind[NAME]=load.info.comboKind[v.NAME]
      combinationBasis[NAME]=`${v.NAME} + ${f.accompanyingLive} PL`
    }
    combo('AD_FLOOR', [['D', f.dead], ['PL', f.live], ['LR', f.accompanyingLive]])
  }
  if (c) for (const cc of a.craneCases) {
    addCase(cc.name, 'USER')
    combo(`AD_${cc.name}`, [['D', f.dead], [cc.name, f.crane], ['LR', f.accompanyingLive]])
    if (p && f.accompanyingLive) combo(`AL_${cc.name}`, [['D', f.dead], [cc.name, f.crane], ['PL',f.accompanyingLive], ['LR', f.accompanyingLive]])
    combo(`AU_${cc.name}`, [['D', 1], [cc.name, f.crane]])
  }
  const link=s.additions?.link
  if(link?.mode==='sliding')for(const cc of a.linkCases??[]) {
    addCase(cc.name,'USER')
    combo(`AD_${cc.name}`,[['D',f.dead],[cc.name,link.loadFactor],['LR',f.accompanyingLive]])
    combo(`AU_${cc.name}`,[['D',1],[cc.name,link.loadFactor]])
    if(p && f.accompanyingLive)combo(`AL_${cc.name}`,[['D',f.dead],[cc.name,link.loadFactor],['PL',f.accompanyingLive],['LR',f.accompanyingLive]])
  }
  load.info.additions = { sources: a.sources, craneCases: a.craneCases, combinationBasis,
    serviceCases: ['D', ...(p ? ['PL'] : []), ...a.craneCases.map((v) => v.name),...(a.linkCases??[]).map((v)=>v.name)],
    factors: (p || c || link?.mode==='sliding') ? f : undefined,
    preliminary: true,
  }
  return load
}
