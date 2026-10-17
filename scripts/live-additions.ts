/** Explicit Gen integration test; always restore the original saved document. Key stays in .env. */
import {createHash} from 'node:crypto'
import {mkdirSync,writeFileSync} from 'node:fs'
import {MidasClient} from 'midas-nx'
import {readMapiKey} from './mapi-key'
;(globalThis as any).document={documentElement:{lang:'ko',dataset:{}}}
const {S}=await import('../src/state/store')
const apiFetch=globalThis.fetch
let tables=0
globalThis.fetch=async(...args:Parameters<typeof fetch>)=>{
  const r=await apiFetch(...args)
  if(String(args[0]).includes('/post/TABLE') && ++tables%10===0)console.log(`${S.code}: ${tables} result tables returned`)
  return r
}
const {DEFAULT_SPEC,CN_DEFAULT_SPEC,KR_DEFAULT_SPEC}=await import('../src/domain/types')
const {sendModel}=await import('../src/actions/build')
const {analyzeCore}=await import('../src/actions/analysis')
const {fetchResults}=await import('../src/actions/results')
const {runDesign}=await import('../src/domain/design')
const {runConnections}=await import('../src/domain/connections')
const {buildReport}=await import('../src/report/report')
const {defaultAdditions,defaultOpening,defaultPlatform}=await import('../src/domain/additions')
const phase5=process.argv.includes('--phase5')
const phase6=process.argv.includes('--phase6')
const {phase6Spec}=await import('./addition-spec')
const key=await readMapiKey(),client=new MidasClient({mapiKey:key,product:'gen',timeout:120000});S.mapiKey=key
const token=new Date().toISOString().replace(/[-:.TZ]/g,''),folder=`output/additions-live-${token}`
mkdirSync(folder,{recursive:true})
const dbs=['UNIT','MATL','SECT','NODE','ELEM','CONS','FRLS','STLD','LCOM-GEN','BODF','BMLD','CNLD']
const canonical=(x:any):string=>JSON.stringify(x,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map((k)=>[k,v[k]])):v)
const hash=(x:any)=>createHash('sha256').update(canonical(x)).digest('hex')
const original:Record<string,string>={};for(const db of dbs)original[db]=hash(await client.request('GET',`/db/${db}`))
const backup=`C:/temp/sms_additions_backup_${token}.mgbx`
const command=async(path:string,arg:string)=>{const r:any=await client.request('POST',path,{Argument:arg});if(r.message!=='MIDAS GEN NX command complete')throw new Error(`${path}: not completed`)}
await command('/doc/saveas',backup)
const state:any={backup,original,restored:false,cases:[]}
const save=()=>writeFileSync(`${folder}/evidence.json`,JSON.stringify(state,null,2));save()
try {
  for(const base of [DEFAULT_SPEC,CN_DEFAULT_SPEC,KR_DEFAULT_SPEC]) {
    let s=structuredClone(base);s.bays=2;s.baySpacing=6;s.bayList=[5,7];s.features={crane:true,mezzanine:true,multiSpan:false,opening:false}
    s.additions=defaultAdditions(s)
    s.additions.equipment=[{id:'EQ1',name:'Roof equipment',x:7.2,y:3.1,weight:40,seismicFraction:.8,source:'Integration test',confirmed:true}]
    s.additions.crane={id:'CR1',elevation:5.2,eccentricity:.3,wheelSpacing:3,maxWheel:45,minWheel:10,impactFactor:1.1,lateral:8,braking:0,seismicWeight:30,driftLimitMm:10,source:'Integration test',confirmed:true}
    s.additions.platform={...defaultPlatform(s),x0:1,x1:11,elevation:3,source:'Integration test',confirmed:true}
    s.additions.factors={...s.additions.factors,source:'Integration test',confirmed:true}
    if(phase5) {
      s.bays=3;s.bayList=[5,7,4];s.baySpacing=7
      s.features.opening=true
      s.additions.wallOpening={...defaultOpening(s),bay:s.code==='CN'?0:1,source:'Closed door project test',confirmed:true}
      s.additions.crane.lateral=0
      s.additions.crane.runway={section:s.sections.rafter,deflectionDivisor:600,source:'Runway integration test',confirmed:true}
    }
    if(phase6)s=phase6Spec(base)
    S.code=s.code
    console.log(`${s.code}: sending ${phase6?'platform + closed roof hatch + floor void + interface reactions':`equipment + crane + platform${phase5?' + runway + closed door':''}`}`)
    await sendModel(s);await analyzeCore()
    console.log(`${s.code}: analyzed; retrieving ${S.built!.combos} combinations`)
    const b=S.built!,res=await fetchResults(b),d=runDesign(s,b.model,b.info,res),connections=runConnections(s,b.model,b.info,res)
    const nodes=new Map(b.model.nodes.map((n)=>[n.id,n])),applied:Record<string,number[]>={}
    for(const [id,rec] of Object.entries(b.sent!.BMLD)) {
      const e=b.model.elements[+id-1],a=nodes.get(e.n1)!,z=nodes.get(e.n2)!,L=Math.hypot(z.x-a.x,z.y-a.y,z.z-a.z)
      for(const it of (rec as any).ITEMS){const v=applied[it.LCNAME]??=[0,0,0];v[['GX','GY','GZ'].indexOf(it.DIRECTION)]+=it.P[0]*L}
    }
    for(const rec of Object.values(b.sent!.CNLD))for(const it of (rec as any).ITEMS){const v=applied[it.LCNAME]??=[0,0,0];v[0]+=it.FX;v[1]+=it.FY;v[2]+=it.FZ}
    let equilibrium=0
    for(const r of S.reactions??[]){const name=r.lc.replace(/\(ST\)$/,'');if(name==='D')continue;const a=applied[name]??[0,0,0];equilibrium=Math.max(equilibrium,Math.max(Math.abs(r.fx+a[0]),Math.abs(r.fy+a[1]),Math.abs(r.fz+a[2]))/Math.max(1,Math.hypot(...a)))}
    if(equilibrium>.002)throw new Error(`${s.code}: reaction imbalance ${equilibrium}`)
    const html=buildReport({built:b,reactions:S.reactions,design:d,connections})
    writeFileSync(`${folder}/${s.code}.html`,html)
    const evidence={code:s.code,nodes:b.model.nodes.length,elements:b.model.elements.length,cases:b.cases.length,combinations:b.combos,equilibrium,members:d.members.length,maxRatio:d.maxRatio,ng:d.ng,service:d.service,sources:b.model.additions!.sources}
    state.cases.push(evidence);save();console.log(`${s.code}: PASS balance ${(equilibrium*100).toFixed(4)}%, checked ${d.members.length} members (NG ${d.ng}; sample sections)`)
  }
} catch(e) {state.log=S.log.slice(-5);state.error=e instanceof Error?e.message:String(e);save();throw e}
finally {
  // Save the test model before reopening to avoid an interactive save prompt.
  await command('/doc/saveas',`C:/temp/sms_additions_scratch_${token}.mgbx`)
  await command('/doc/open',backup)
  state.after={};for(const db of dbs)state.after[db]=hash(await client.request('GET',`/db/${db}`))
  state.restored=dbs.every((db)=>original[db]===state.after[db]);save()
  if(!state.restored)throw new Error(`Original model restoration mismatch; recovery ${folder}/evidence.json`)
  console.log(`Original model restored; 12 database hashes match. Evidence: ${folder}`)
}
