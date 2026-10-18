/** User-selected section repairs. Estimates reuse existing forces; only Gen reanalysis verifies redistribution. */
import type { Built } from '../state/store'
import type { Results } from '../actions/results'
import { runDesign, purlinDefl, purlinLimitDiv, type DesignResult, type MemberCheck, type ServiceCheck } from './design'
import { runConnections, type ConnResult } from './connections'
import { sectionProps } from './sections'
import { sectionCatalogOptions } from './sectionCatalog'
import { buildPortal } from './portal'
import { frameStiff } from './optimize'
import type { FactorySpec, ElementRole } from './types'
import type { AdditionUsage } from './additionTypes'

export const REPAIR_GROUPS=['frame','longitudinal','purlin','girt','post','platformBeam','platformColumn','runway','header','roofTrimmer','link'] as const
export type RepairGroup=typeof REPAIR_GROUPS[number]
export type SectionTarget=ElementRole|'platformBeam'|'platformColumn'|'runway'|'header'|'roofTrimmer'
export interface SectionChange { target:SectionTarget; section:string }
export interface RepairProblem {
  kind:'strength'|'slenderness'|'service'|'connection'|'limit'; ratio:number; member?:MemberCheck
  service?:ServiceCheck; connection?:ConnResult
}
export interface RepairDiagnosis { group:RepairGroup; problems:RepairProblem[]; count:number; maxRatio:number }
export interface RepairMetrics { memberNg:number; serviceNg:number; connectionNg:number; blocked:number; memberMax:number; serviceMax:number; connectionMax:number }
export interface RepairCandidate { id:string; changes:SectionChange[]; strength:number; service:number; connection:number; blocked:number; ranked:boolean; catalogReview:boolean }
export interface RepairOptions extends RepairDiagnosis { candidates:RepairCandidate[] }
export interface RepairPlan { source:Built; results:Results; design:DesignResult; connections:ConnResult[]; groups:RepairOptions[] }
export interface RepairPreview { spec:FactorySpec; changes:SectionChange[]; metrics:RepairMetrics; service:ServiceCheck[] }
export interface RepairComparison { before:RepairMetrics; estimated:RepairMetrics; after:RepairMetrics; changes:SectionChange[]; built:Built; design:DesignResult }

const usageGroups:Record<AdditionUsage,RepairGroup>={'platform-beam':'platformBeam','floor-trimmer':'platformBeam','platform-column':'platformColumn','runway-beam':'runway','opening-header':'header','roof-trimmer':'roofTrimmer'}
export const memberRepairGroup=(m:MemberCheck):RepairGroup=>m.addition?usageGroups[m.addition]:m.role==='column'||m.role==='rafter'?'frame':m.role==='strut'||m.role==='brace'?'longitudinal':m.role
const serviceGroup:Record<ServiceCheck['key'],RepairGroup>={windDriftX:'frame',seisDriftX:'frame',rafterDefl:'frame',windDriftY:'longitudinal',seisDriftY:'longitudinal',purlinDefl:'purlin',girtDefl:'girt',postDefl:'post',platformDefl:'platformBeam',runwayDefl:'runway',craneDefl:'frame',roofOpeningDefl:'roofTrimmer',linkGap:'link',linkSeat:'link'}
const connGroup=(c:ConnResult):RepairGroup=>c.type==='brace'?'longitudinal':'frame'
const max=(xs:number[])=>xs.reduce((a,b)=>Math.max(a,b),0)
export function repairMetrics(d:DesignResult,cs:ConnResult[]):RepairMetrics {
  const axial=d.col13&&!d.col13.exempt?d.col13.ratio:0
  return {memberNg:d.members.filter((m)=>m.ratio>1).length+Number(axial>1),serviceNg:d.service.filter((s)=>s.ratio>1).length,connectionNg:cs.filter((c)=>c.ratio>1).length,
    blocked:d.members.filter((m)=>m.issues?.some((i)=>i.level==='blocked')).length,memberMax:Math.max(d.maxRatio,axial),serviceMax:max(d.service.map((s)=>s.ratio)),connectionMax:max(cs.map((c)=>c.ratio))}
}
export function diagnoseRepairs(d:DesignResult,cs:ConnResult[]):RepairDiagnosis[] {
  const groups=new Map<RepairGroup,RepairProblem[]>()
  const add=(g:RepairGroup,p:RepairProblem)=>groups.set(g,[...groups.get(g)??[],p])
  for(const m of d.members) {
    if(m.ratio>1)add(memberRepairGroup(m),{kind:m.eq==='KL/r'?'slenderness':'strength',ratio:m.ratio,member:m})
    if(m.issues?.some((i)=>i.level==='blocked'))add(memberRepairGroup(m),{kind:'limit',ratio:m.ratio,member:m})
  }
  if(d.col13&&!d.col13.exempt&&d.col13.ratio>1)add('frame',{kind:'strength',ratio:d.col13.ratio})
  for(const s of d.service)if(s.ratio>1)add(serviceGroup[s.key],{kind:'service',ratio:s.ratio,service:s})
  for(const c of cs)if(c.ratio>1)add(connGroup(c),{kind:'connection',ratio:c.ratio,connection:c})
  return REPAIR_GROUPS.filter((g)=>groups.has(g)).map((group)=>{const problems=groups.get(group)!.sort((a,b)=>b.ratio-a.ratio);return {group,problems,count:problems.length,maxRatio:max(problems.map((p)=>p.ratio))}})
}
const targets:Record<RepairGroup,SectionTarget[]>={frame:['column','rafter'],longitudinal:['strut','brace'],purlin:['purlin'],girt:['girt'],post:['post'],platformBeam:['platformBeam'],platformColumn:['platformColumn'],runway:['runway'],header:['header'],roofTrimmer:['roofTrimmer'],link:[]}
export function sectionAt(s:FactorySpec,target:SectionTarget):string|undefined {
  switch(target) {
    case 'platformBeam':return s.additions?.platform?.beamSection
    case 'platformColumn':return s.additions?.platform?.columnSection
    case 'runway':return s.additions?.crane?.runway?.section
    case 'header':return s.additions?.wallOpening?.headerSection
    case 'roofTrimmer':return s.additions?.roofOpening?.section
    default:return s.sections[target]
  }
}
/** Only section fields may change; project actions, confirmations and geometry stay intact. */
export function applySectionChanges(base:FactorySpec,changes:SectionChange[]):FactorySpec {
  const s=structuredClone(base)
  for(const {target,section} of changes) {
    if(!sectionAt(s,target))throw new Error('repair_invalid')
    switch(target) {
      case 'platformBeam':s.additions!.platform!.beamSection=section;break
      case 'platformColumn':s.additions!.platform!.columnSection=section;break
      case 'runway':s.additions!.crane!.runway!.section=section;break
      case 'header':s.additions!.wallOpening!.headerSection=section;break
      case 'roofTrimmer':s.additions!.roofOpening!.section=section;break
      default:s.sections[target]=section
    }
  }
  return s
}
const roleFor=(target:SectionTarget):ElementRole=>target==='platformColumn'?'column':['platformBeam','runway','header','roofTrimmer'].includes(target)?'rafter':target as ElementRole
function choices(s:FactorySpec,target:SectionTarget):string[] {
  const current=sectionAt(s,target)
  if(!current)return []
  const p=sectionProps(current),role=roleFor(target)
  const mat=(role==='purlin'||role==='girt')?(s.secondaryMaterial??s.material):s.material
  const options=sectionCatalogOptions(s.code,role,mat).map((o)=>o.name).filter((name)=>{
    const q=sectionProps(name)
    return q.kind===p.kind&&q.A>p.A&&q.Ix>=p.Ix&&q.Iy>=p.Iy
  }).sort((a,b)=>sectionProps(a).A-sectionProps(b).A)
  // Sample the full eligible range as well as close sizes; long unsupported members may need a wider section.
  const indices=[0,1,2,3,Math.floor(options.length*.25),Math.floor(options.length*.5),Math.floor(options.length*.75),options.length-1]
  return [current,...new Set(indices.filter((i)=>i>=0&&i<options.length).map((i)=>options[i]))]
}
function modelFor(b:Built,spec:FactorySpec) {
  const model=buildPortal(spec)
  if(model.elements.length!==b.model.elements.length||model.nodes.length!==b.model.nodes.length)throw new Error('repair_geometry')
  for(let i=0;i<model.elements.length;i++) {
    const a=model.elements[i],z=b.model.elements[i]
    if(a.id!==z.id||a.n1!==z.n1||a.n2!==z.n2||a.role!==z.role||a.addition!==z.addition)throw new Error('repair_geometry')
  }
  for(let i=0;i<model.nodes.length;i++) {
    const a=model.nodes[i],z=b.model.nodes[i]
    if(a.id!==z.id||a.x!==z.x||a.y!==z.y||a.z!==z.z)throw new Error('repair_geometry')
  }
  return model
}
/** Scaling is an estimate, including when the old displacement happened to be zero. It never replaces analysis. */
function estimateServices(b:Built,s:FactorySpec,service:ServiceCheck[]):ServiceCheck[] {
  const ix=(t:SectionTarget)=>sectionProps(sectionAt(b.spec,t)!).Ix/sectionProps(sectionAt(s,t)!).Ix
  return service.map((v)=>{
    let scale=1
    switch(v.key) {
      case 'purlinDefl': {const value=purlinDefl(s,b.info,s.sections.purlin),limit=s.baySpacing/purlinLimitDiv(s.code);return {...v,value,limit,ratio:value/limit}}
      case 'girtDefl':scale=ix('girt');break
      case 'postDefl':scale=ix('post');break
      case 'platformDefl':if(s.additions?.platform)scale=ix('platformBeam');break
      case 'runwayDefl':if(s.additions?.crane?.runway)scale=ix('runway');break
      case 'roofOpeningDefl':if(s.additions?.roofOpening)scale=ix('roofTrimmer');break
      case 'windDriftY':case 'seisDriftY':scale=sectionProps(b.spec.sections.brace).A/sectionProps(s.sections.brace).A;break
      case 'windDriftX':case 'seisDriftX':case 'rafterDefl':
        if(s.frame!=='multi') {const a=frameStiff(b.spec,b.spec.sections.column,b.spec.sections.rafter),z=frameStiff(s,s.sections.column,s.sections.rafter);scale=v.key==='rafterDefl'?z.defl/a.defl:a.k/z.k}
        break
      // Crane movement and external gap/seating cannot be inferred from one member's stiffness.
    }
    return {...v,value:v.value*scale,ratio:v.ratio*scale}
  })
}
export async function createRepairPlan(b:Built,res:Results,d:DesignResult,cs:ConnResult[],tick:()=>void=()=>{}):Promise<RepairPlan> {
  const groups:RepairOptions[]=[]
  for(const diagnosis of diagnoseRepairs(d,cs)) {
    const ts=targets[diagnosis.group],lists=ts.map((target)=>choices(b.spec,target)),patches:SectionChange[][]=[]
    if(ts.length===1)for(const section of lists[0].slice(1))patches.push([{target:ts[0],section}])
    if(ts.length===2)for(const a of lists[0])for(const z of lists[1]) {
      const changes=[{target:ts[0],section:a},{target:ts[1],section:z}].filter((p)=>sectionAt(b.spec,p.target)!==p.section)
      if(changes.length)patches.push(changes)
    }
    const candidates:RepairCandidate[]=[],roles:ElementRole[]=diagnosis.group==='platformColumn'?['post']
      :['platformBeam','runway','header','roofTrimmer'].includes(diagnosis.group)?['strut']:[...new Set(ts.map(roleFor))]
    for(let i=0;i<patches.length;i++) {
      if(i%4===0){await new Promise<void>((resolve)=>setTimeout(resolve,0));tick()}
      const changes=patches[i],spec=applySectionChanges(b.spec,changes),model=modelFor(b,spec)
      const tested=runDesign(spec,model,b.info,res,roles),members=tested.members.filter((m)=>memberRepairGroup(m)===diagnosis.group)
      if(!members.length)continue
      const blocked=members.filter((m)=>m.issues?.some((v)=>v.level==='blocked')).length
      if(blocked)continue
      const strength=Math.max(max(members.map((m)=>m.ratio)),diagnosis.group==='frame'&&tested.col13&&!tested.col13.exempt?tested.col13.ratio:0)
      const service=max(estimateServices(b,spec,d.service).filter((v)=>serviceGroup[v.key]===diagnosis.group).map((v)=>v.ratio))
      const connection=diagnosis.group==='frame'||diagnosis.group==='longitudinal'?max(runConnections(spec,model,b.info,res).filter((c)=>connGroup(c)===diagnosis.group).map((c)=>c.ratio)):max(cs.map((c)=>c.ratio))
      const ranked=strength<=.95&&service<=.95&&connection<=1
      const catalogReview=changes.some((p)=>{
        const role=roleFor(p.target),material=role==='purlin'||role==='girt'?(spec.secondaryMaterial??spec.material):spec.material
        const entry=sectionCatalogOptions(spec.code,role,material).find((o)=>o.name===p.section)
        return entry?.selectionStatus!=='normal'||entry?.materialSupport[material]?.status!=='implemented'
      })
      candidates.push({id:`${diagnosis.group}:${i}`,changes,strength,service,connection,blocked,ranked,catalogReview})
    }
    const weight=(c:RepairCandidate)=>c.changes.reduce((sum,p)=>sum+sectionProps(p.section).A-sectionProps(sectionAt(b.spec,p.target)!).A,0)
    candidates.sort((a,z)=>Number(z.ranked)-Number(a.ranked)||Math.max(a.strength,a.service,a.connection)-Math.max(z.strength,z.service,z.connection)||weight(a)-weight(z))
    const recommended=candidates.filter((c)=>c.ranked).sort((a,z)=>weight(a)-weight(z)).slice(0,3)
    const kept=[...recommended,...candidates.filter((c)=>!recommended.includes(c))].slice(0,5)
    groups.push({...diagnosis,candidates:kept})
  }
  return {source:b,results:res,design:d,connections:cs,groups}
}
/** Resolve only IDs offered in this exact plan. A fabricated ID must never mutate Gen. */
export function previewRepair(plan:RepairPlan,selection:Record<string,string>):RepairPreview|null {
  const changes:SectionChange[]=[]
  for(const [group,id] of Object.entries(selection)) {
    if(!id)continue
    const candidate=plan.groups.find((g)=>g.group===group)?.candidates.find((c)=>c.id===id)
    if(!candidate)throw new Error('repair_invalid')
    changes.push(...candidate.changes)
  }
  if(!changes.length)return null
  const spec=applySectionChanges(plan.source.spec,changes),model=modelFor(plan.source,spec)
  const design=runDesign(spec,model,plan.source.info,plan.results)
  design.service=estimateServices(plan.source,spec,plan.design.service)
  const connections=runConnections(spec,model,plan.source.info,plan.results)
  return {spec,changes,metrics:repairMetrics(design,connections),service:design.service}
}
