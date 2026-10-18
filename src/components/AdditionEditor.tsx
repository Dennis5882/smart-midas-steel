import { useEffect, useId, useState } from 'react'
import { t, type I18nKey } from '../i18n'
import { additionErrors, defaultAdditions, defaultOpening, defaultPlatform, openingBayOptions } from '../domain/additions'
import { portalGeometry } from '../domain/portal'
import {Phase6Editor} from './Phase6Editor'
import type { FactoryAdditions } from '../domain/additionTypes'
import type { FactorySpec } from '../domain/types'
import { NumericInput } from './NumericInput'
import { sectionCatalogOptions } from '../domain/sectionCatalog'
import { additionPartForPath, type AdditionPart } from './modelingFlow'

export function AdditionNumber({value,onValueChange,...props}: Omit<Parameters<typeof NumericInput>[0],'value'|'onValueChange'> & {value:number;onValueChange(v:number):void}) {
  const [raw,setRaw]=useState(Number.isNaN(value)?'':String(value))
  useEffect(()=>{if(!Object.is(raw.trim()===''?NaN:Number(raw),value))setRaw(Number.isNaN(value)?'':String(value))},[value])
  return <NumericInput {...props} value={raw} onValueChange={(v)=>{setRaw(v);onValueChange(v.trim()===''?NaN:Number(v))}}/>
}

export function AdditionEditor({spec, value, onChange, disabled, attempted = false, idPrefix, part}: {
  spec: FactorySpec; value?: FactoryAdditions; onChange(v: FactoryAdditions): void; disabled: boolean; attempted?: boolean; idPrefix?:string; part?:AdditionPart
}) {
  const id = useId(), a = value ?? defaultAdditions(spec)
  const update = (v: FactoryAdditions) => {
    const craneBasis=(c:FactoryAdditions['crane'])=>c && Object.fromEntries(Object.entries(c).filter(([k])=>!['runway','confirmed','source'].includes(k)))
    if(v.crane?.runway && JSON.stringify(craneBasis(v.crane))!==JSON.stringify(craneBasis(a.crane))) v={...v,crane:{...v.crane,runway:{...v.crane.runway,confirmed:false}}}
    const platformBasis=(p:FactoryAdditions['platform'])=>p&&Object.fromEntries(Object.entries(p).filter(([k])=>!['confirmed','source'].includes(k)))
    if(v.floorOpening&&JSON.stringify(platformBasis(v.platform))!==JSON.stringify(platformBasis(a.platform)))v={...v,floorOpening:{...v.floorOpening,confirmed:false}}
    onChange(v)
  }
  const input = (o: Record<string, any>, k: string, change: (v: any) => void, unit = '', label: I18nKey = `add_${k}` as I18nKey) => {
    const num = typeof o[k] === 'number', fid = `${id}-${o.id ?? 'factors'}-${k}`
    return <div className="pe-f" key={k}><label htmlFor={fid}>{t(label)}</label><div className="pe-in">
      {['beamSection','columnSection','headerSection','section'].includes(k) ? <select id={fid} value={o[k]} disabled={disabled} onChange={(e)=>change(e.target.value)}>
        {sectionCatalogOptions(spec.code,k==='beamSection'?'rafter':'column',spec.material).filter((v)=>v.shape==='H').map((v)=><option key={v.name} value={v.name}>{v.name}{v.selectionStatus==='normal'?'':' ⚠'}</option>)}
      </select> : num ? <AdditionNumber id={fid} value={o[k]} disabled={disabled} step={(/Bay$/.test(k)||k==='bay') ? 1 : .1} min={(/Bay$/.test(k)||k==='bay')?1:0} onValueChange={change}/>
        : <input id={fid} value={o[k]} disabled={disabled} onChange={(e)=>change(e.target.value)} />}
      {unit && <span className="pe-u">{unit}</span>}
    </div>{(k==='beamSection'||k==='columnSection') && <small>{t('add_catalog_note')}</small>}</div>
  }
  const confirm = (o: {id?:string;source:string;confirmed:boolean}, change: (patch: Partial<typeof o>)=>void) => <>
    {input(o,'source',(v)=>change({source:v,confirmed:false}))}
    <label className="pe-f pe-full"><span><input type="checkbox" checked={o.confirmed} disabled={disabled || !o.source.trim()} onChange={(e)=>change({confirmed:e.target.checked})}/> {t('add_confirm')}</span></label>
  </>
  const c = a.crane, p = a.platform, f = a.factors
  const show = (name: AdditionPart) => !part || part === name
  return <section className="mw-group addition-editor">{!part && <><h4>{t('add_title')}</h4><p className="mw-note">{t('add_note')}</p></>}
    {show('equipment') && <div id={`${idPrefix??id}.equipment`} tabIndex={-1}>{a.equipment.map((e, i) => {
      const change = (patch: object) => update({...a,equipment:a.equipment.map((v,j)=>j===i?{...v,...patch}:v)})
      return <fieldset key={e.id} disabled={disabled}><legend>{t('add_equipment')} {i+1}</legend><div className="pe-grid">
        {(['name','x','y','weight','seismicFraction'] as const).map((k)=>input(e,k,(v)=>change({[k]:v,confirmed:false}),k==='x'||k==='y'?'m':k==='weight'?'kN':'',k==='seismicFraction'?'add_mass':`add_${k}`))}
        {confirm(e,change)}
      </div><button type="button" className="btn btn-s" disabled={disabled} onClick={()=>update({...a,equipment:a.equipment.filter((_,j)=>j!==i)})}>{t('add_remove')}</button></fieldset>
    })}
    <button type="button" className="btn btn-s" disabled={disabled} onClick={()=>update({...a,equipment:[...a.equipment,{id:crypto.randomUUID(),name:`${t('add_equipment')} ${a.equipment.length+1}`,x:spec.span/2,y:0,weight:0,seismicFraction:1,source:'',confirmed:false}]})}>{t('add_add')}</button></div>}
    {show('crane') && spec.features?.crane && c && <fieldset id={`${idPrefix??id}.crane`} tabIndex={-1} disabled={disabled}><legend>{t('add_crane')}</legend><p className="mw-note">{t('add_crane_note')}</p><div className="pe-grid">
      {(['elevation','eccentricity','wheelSpacing','maxWheel','minWheel','impactFactor','lateral','braking','seismicWeight','driftLimitMm'] as const).map((k)=>input(c,k,(v)=>update({...a,crane:{...c,[k]:v,confirmed:false}}),k==='driftLimitMm'?'mm':['elevation','eccentricity','wheelSpacing'].includes(k)?'m':k==='impactFactor'?'':'kN'))}
      {confirm(c,(patch)=>update({...a,crane:{...c,...patch}}))}
    </div><label className="pe-f"><span><input type="checkbox" disabled={disabled} checked={!!c.runway} onChange={(e)=>update({...a,crane:{...c,confirmed:false,runway:e.target.checked?{section:spec.sections.rafter,deflectionDivisor:600,source:'',confirmed:false}:undefined}})}/> {t('add_runway')}</span></label>
      {c.runway && <><p className="mw-note">{t('add_runway_note')}</p><div className="pe-grid">
        {input({...c.runway,id:c.id+'-runway'},'section',(v)=>update({...a,crane:{...c,runway:{...c.runway!,section:v,confirmed:false}}}))}
        {input({...c.runway,id:c.id+'-runway'},'deflectionDivisor',(v)=>update({...a,crane:{...c,runway:{...c.runway!,deflectionDivisor:v,confirmed:false}}}))}
        {confirm({...c.runway,id:c.id+'-runway'},(patch)=>update({...a,crane:{...c,runway:{...c.runway!,...patch}}}))}
      </div></>}
    </fieldset>}
    {show('opening') && spec.features?.opening && a.wallOpening && (()=>{
      const o=a.wallOpening!, change=(patch:object)=>update({...a,wallOpening:{...o,...patch,confirmed:false}})
      return <fieldset id={`${idPrefix??id}.wallOpening`} tabIndex={-1} disabled={disabled}><legend>{t('add_wallOpening')}</legend><p className="mw-note">{t('add_opening_note')}</p><div className="pe-grid">
        <div className="pe-f"><label htmlFor={`${id}-face`}>{t('add_face')}</label><select id={`${id}-face`} value={o.face} onChange={(e)=>change({face:e.target.value})}><option value="x0">X = 0</option><option value="xL">X = {spec.span} m</option></select></div>
        <div className="pe-f"><label htmlFor={`${id}-bay`}>{t('add_bay')}</label><select id={`${id}-bay`} value={o.bay} onChange={(e)=>change({bay:Number(e.target.value)})}>{openingBayOptions(spec).map((v)=><option key={v.bay} value={v.bay} disabled={v.braced}>{v.bay+1} · {v.width} m{v.braced?` · ${t('role_brace')}`:''}</option>)}</select></div>
        <div className="pe-f"><label htmlFor={`${id}-height`}>{t('add_height')}</label><select id={`${id}-height`} value={o.height} onChange={(e)=>change({height:Number(e.target.value)})}>{portalGeometry(spec).girtZsAt(o.face==='x0'?0:spec.span).filter((z)=>z>0 && z<portalGeometry(spec).zAt(o.face==='x0'?0:spec.span)).map((z)=><option key={z} value={z}>{+z.toFixed(3)} m</option>)}</select></div>
        {input(o,'headerSection',(v)=>change({headerSection:v}))}
        {confirm(o,(patch)=>update({...a,wallOpening:{...o,...patch}}))}
      </div></fieldset>
    })()}
    {show('platform') && spec.features?.mezzanine && p && <fieldset id={`${idPrefix??id}.platform`} tabIndex={-1} disabled={disabled}><legend>{t('add_platform')}</legend><p className="mw-note">{t('add_platform_note')}</p><div className="pe-grid">
      {(['elevation','x0','x1','firstBay','lastBay','beamSpacing','beamSection','columnSection','dead','live','liveMassFraction','deflectionDivisor'] as const).map((k)=>input(/Bay$/.test(k)?{...p,[k]:p[k as 'firstBay'|'lastBay']+1}:p,k,(v)=>update({...a,platform:{...p,[k]:/Bay$/.test(k)?v-1:v,confirmed:false}}),['elevation','x0','x1','beamSpacing'].includes(k)?'m':['dead','live'].includes(k)?'kN/m²':''))}
      {confirm(p,(patch)=>update({...a,platform:{...p,...patch}}))}
    </div></fieldset>}
    {(!part || part === 'opening' || part === 'link') && <Phase6Editor spec={spec} value={a} onChange={update} disabled={disabled} idPrefix={idPrefix??id} part={part === 'opening' ? 'openings' : part}/>}
    {show('factors') && (spec.features?.crane || spec.features?.mezzanine || a.link?.mode==='sliding') && <fieldset id={`${idPrefix??id}.factors`} tabIndex={-1} disabled={disabled}><legend>{t('add_factors')}</legend><div className="pe-grid">
      {(['dead','live','crane','accompanyingLive'] as const).map((k)=>input(f,k,(v)=>update({...a,factors:{...f,[k]:v,confirmed:false}}),'',`add_${k}`))}
      {confirm(f,(patch)=>update({...a,factors:{...f,...patch}}))}
    </div></fieldset>}
    {(attempted || disabled) && additionErrors(spec).filter((e)=>!part || additionPartForPath(e.path)===part).map((e,i)=><p className="mw-error" role="alert" key={i}>{t(e.key)} {e.name}</p>)}
  </section>
}

/** Features can be chosen before loads are known. Never manufacture rated-capacity wheel loads. */
export function initializeAdditions(spec: FactorySpec, a = spec.additions ?? defaultAdditions(spec)): FactoryAdditions {
  return {...a,
    crane: spec.features?.crane && !a.crane ? {id:'crane-1',elevation:Math.min(5,spec.eaveHeight*.65),eccentricity:.3,wheelSpacing:3,maxWheel:0,minWheel:0,impactFactor:1.1,lateral:0,braking:0,seismicWeight:0,driftLimitMm:10,source:'',confirmed:false} : a.crane,
    platform: spec.features?.mezzanine && !a.platform ? defaultPlatform(spec) : a.platform,
    wallOpening: spec.features?.opening && !a.wallOpening ? defaultOpening(spec) : a.wallOpening,
  }
}
