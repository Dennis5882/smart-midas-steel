import { useEffect, useId, useState } from 'react'
import { t, type I18nKey } from '../i18n'
import { additionErrors, defaultAdditions, defaultPlatform } from '../domain/additions'
import type { FactoryAdditions } from '../domain/additionTypes'
import type { FactorySpec } from '../domain/types'
import { NumericInput } from './NumericInput'
import { sectionCatalogOptions } from '../domain/sectionCatalog'

function AdditionNumber({value,onValueChange,...props}: Omit<Parameters<typeof NumericInput>[0],'value'|'onValueChange'> & {value:number;onValueChange(v:number):void}) {
  const [raw,setRaw]=useState(Number.isNaN(value)?'':String(value))
  useEffect(()=>{if(!Object.is(raw.trim()===''?NaN:Number(raw),value))setRaw(Number.isNaN(value)?'':String(value))},[value])
  return <NumericInput {...props} value={raw} onValueChange={(v)=>{setRaw(v);onValueChange(v.trim()===''?NaN:Number(v))}}/>
}

export function AdditionEditor({spec, value, onChange, disabled, attempted = false, idPrefix}: {
  spec: FactorySpec; value?: FactoryAdditions; onChange(v: FactoryAdditions): void; disabled: boolean; attempted?: boolean; idPrefix?:string
}) {
  const id = useId(), a = value ?? defaultAdditions(spec)
  const update = (v: FactoryAdditions) => onChange(v)
  const input = (o: Record<string, any>, k: string, change: (v: any) => void, unit = '', label: I18nKey = `add_${k}` as I18nKey) => {
    const num = typeof o[k] === 'number', fid = `${id}-${o.id ?? 'factors'}-${k}`
    return <div className="pe-f" key={k}><label htmlFor={fid}>{t(label)}</label><div className="pe-in">
      {k==='beamSection' || k==='columnSection' ? <select id={fid} value={o[k]} disabled={disabled} onChange={(e)=>change(e.target.value)}>
        {sectionCatalogOptions(spec.code,k==='beamSection'?'rafter':'column',spec.material).filter((v)=>v.shape==='H').map((v)=><option key={v.name} value={v.name}>{v.name}{v.selectionStatus==='normal'?'':' ⚠'}</option>)}
      </select> : num ? <AdditionNumber id={fid} value={o[k]} disabled={disabled} step={/Bay$/.test(k) ? 1 : .1} min={/Bay$/.test(k)?1:0} onValueChange={change}/>
        : <input id={fid} value={o[k]} disabled={disabled} onChange={(e)=>change(e.target.value)} />}
      {unit && <span className="pe-u">{unit}</span>}
    </div>{(k==='beamSection'||k==='columnSection') && <small>{t('add_catalog_note')}</small>}</div>
  }
  const confirm = (o: {source:string;confirmed:boolean}, change: (patch: Partial<typeof o>)=>void) => <>
    {input(o,'source',(v)=>change({source:v,confirmed:false}))}
    <label className="pe-f pe-full"><span><input type="checkbox" checked={o.confirmed} disabled={disabled || !o.source.trim()} onChange={(e)=>change({confirmed:e.target.checked})}/> {t('add_confirm')}</span></label>
  </>
  const c = a.crane, p = a.platform, f = a.factors
  return <section className="mw-group addition-editor"><h4>{t('add_title')}</h4><p className="mw-note">{t('add_note')}</p>
    <div id={`${idPrefix??id}.equipment`} tabIndex={-1}>{a.equipment.map((e, i) => {
      const change = (patch: object) => update({...a,equipment:a.equipment.map((v,j)=>j===i?{...v,...patch}:v)})
      return <fieldset key={e.id} disabled={disabled}><legend>{t('add_equipment')} {i+1}</legend><div className="pe-grid">
        {(['name','x','y','weight','seismicFraction'] as const).map((k)=>input(e,k,(v)=>change({[k]:v,confirmed:false}),k==='x'||k==='y'?'m':k==='weight'?'kN':'',k==='seismicFraction'?'add_mass':`add_${k}`))}
        {confirm(e,change)}
      </div><button type="button" className="btn btn-s" onClick={()=>update({...a,equipment:a.equipment.filter((_,j)=>j!==i)})}>{t('add_remove')}</button></fieldset>
    })}
    <button type="button" className="btn btn-s" disabled={disabled} onClick={()=>update({...a,equipment:[...a.equipment,{id:crypto.randomUUID(),name:`${t('add_equipment')} ${a.equipment.length+1}`,x:spec.span/2,y:0,weight:0,seismicFraction:1,source:'',confirmed:false}]})}>{t('add_add')}</button></div>
    {spec.features?.crane && c && <fieldset id={`${idPrefix??id}.crane`} tabIndex={-1} disabled={disabled}><legend>{t('add_crane')}</legend><p className="mw-note">{t('add_crane_note')}</p><div className="pe-grid">
      {(['elevation','eccentricity','wheelSpacing','maxWheel','minWheel','impactFactor','lateral','braking','seismicWeight','driftLimitMm'] as const).map((k)=>input(c,k,(v)=>update({...a,crane:{...c,[k]:v,confirmed:false}}),k==='driftLimitMm'?'mm':['elevation','eccentricity','wheelSpacing'].includes(k)?'m':k==='impactFactor'?'':'kN'))}
      {confirm(c,(patch)=>update({...a,crane:{...c,...patch}}))}
    </div></fieldset>}
    {spec.features?.mezzanine && p && <fieldset id={`${idPrefix??id}.platform`} tabIndex={-1} disabled={disabled}><legend>{t('add_platform')}</legend><p className="mw-note">{t('add_platform_note')}</p><div className="pe-grid">
      {(['elevation','x0','x1','firstBay','lastBay','beamSpacing','beamSection','columnSection','dead','live','liveMassFraction','deflectionDivisor'] as const).map((k)=>input(/Bay$/.test(k)?{...p,[k]:p[k as 'firstBay'|'lastBay']+1}:p,k,(v)=>update({...a,platform:{...p,[k]:/Bay$/.test(k)?v-1:v,confirmed:false}}),['elevation','x0','x1','beamSpacing'].includes(k)?'m':['dead','live'].includes(k)?'kN/m²':''))}
      {confirm(p,(patch)=>update({...a,platform:{...p,...patch}}))}
    </div></fieldset>}
    {(spec.features?.crane || spec.features?.mezzanine) && <fieldset id={`${idPrefix??id}.factors`} tabIndex={-1} disabled={disabled}><legend>{t('add_factors')}</legend><div className="pe-grid">
      {(['dead','live','crane','accompanyingLive'] as const).map((k)=>input(f,k,(v)=>update({...a,factors:{...f,[k]:v,confirmed:false}}),'',`add_${k}`))}
      {confirm(f,(patch)=>update({...a,factors:{...f,...patch}}))}
    </div></fieldset>}
    {(attempted || disabled) && additionErrors(spec).map((e,i)=><p className="mw-error" role="alert" key={i}>{t(e.key)} {e.name}</p>)}
  </section>
}

/** Features can be chosen before loads are known. Never manufacture rated-capacity wheel loads. */
export function initializeAdditions(spec: FactorySpec, a = spec.additions ?? defaultAdditions(spec)): FactoryAdditions {
  return {...a,
    crane: spec.features?.crane && !a.crane ? {id:'crane-1',elevation:Math.min(5,spec.eaveHeight*.65),eccentricity:.3,wheelSpacing:3,maxWheel:0,minWheel:0,impactFactor:1.1,lateral:0,braking:0,seismicWeight:0,driftLimitMm:10,source:'',confirmed:false} : a.crane,
    platform: spec.features?.mezzanine && !a.platform ? defaultPlatform(spec) : a.platform,
  }
}
