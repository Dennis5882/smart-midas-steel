/** Seven-stage flow, independent feature controls, read-only summaries and unique editor targets. */
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
;(globalThis as any).React=await import('react') // tsx uses classic JSX for this standalone script.
;(globalThis as any).document={documentElement:{lang:'ko',dataset:{}}}
const { MODEL_STEPS, ADDITIONS_STEP, LOADS_STEP, REVIEW_STEP, additionPartForPath, additionPartActive, scopeIssueStep }=await import('../src/components/modelingFlow')
const { ModelWizard }=await import('../src/components/ModelWizard')
const { StructureEditor, StructureSummary }=await import('../src/components/StructureEditor')
const { initializeAdditions }=await import('../src/components/AdditionEditor')
const { fieldStep }=await import('../src/components/planFields')
const { defaultSpecFor }=await import('../src/domain/types')
const { defaultLink,defaultRoofOpening,defaultFloorOpening }=await import('../src/domain/phase6')
const { NO_FEATURES,checkScope }=await import('../src/domain/scope')
const { setLang,t }=await import('../src/i18n')
assert.equal(MODEL_STEPS.length,7);assert.equal(REVIEW_STEP,6)
for(const path of ['additions.crane','additions.platform','additions.wallOpening','additions.roofOpening','additions.floorOpening','additions.link','additions.equipment','additions.factors'])assert.equal(fieldStep({path}),ADDITIONS_STEP)
for(const path of ['roofDead','wallDead','wind.V10','china.w0','korea.region'])assert.equal(fieldStep({path}),LOADS_STEP)
assert.equal(scopeIssueStep('multiSpan'),1);assert.equal(scopeIssueStep('additionInput'),ADDITIONS_STEP)
for(const path of ['wallOpening','roofOpening','floorOpening'])assert.equal(additionPartForPath(path),'opening')
for(const lang of ['ko','en','zh-TW','zh-CN'] as const) {
  setLang(lang)
  assert.ok(t('sc_additionInput').includes(t('mw_additions')),'Incomplete inputs point to Additional structures, not site loads')
  assert.ok(t('g_model_note').includes(t('mw_additions')),'Help describes the current seven-stage process')
  for(const code of ['TW','CN','KR'] as const) {
    const spec={...structuredClone(defaultSpecFor(code)),features:{...NO_FEATURES}}
    spec.additions=initializeAdditions(spec)
    assert.equal(checkScope(spec).blocked,false)
    const props={spec,onFeaturesChange:()=>{},onChange:()=>{},disabled:false,idPrefix:'flow-test'}
    const initial=renderToStaticMarkup(createElement(StructureEditor,props))
    assert.equal((initial.match(/class="structure-card"/g)??[]).length,5)
    assert.ok(!initial.includes('name="multiSpan"'))
    const missing=initializeAdditions({...spec,features:{...spec.features,crane:true}},spec.additions)
    const crane={...spec,features:{...spec.features,crane:true},additions:missing}
    assert.equal(additionPartActive(crane,'crane'),true)
    assert.equal(additionPartActive(crane,'platform'),false)
    assert.equal(additionPartActive(crane,'link'),false)
    assert.ok(checkScope(crane).blocked,'Unconfirmed enabled structures still block generation')
    const withLink={...spec,additions:{...spec.additions,link:defaultLink(spec)}}
    assert.equal(additionPartActive(withLink,'link'),true)
    assert.equal(withLink.frame,spec.frame,'Building interfaces never change frame topology')
    const multi={...spec,frame:'multi' as const,spanList:[12,12],features:{...spec.features,multiSpan:true}}
    assert.equal(additionPartActive(multi,'link'),false)
    const active={...spec,features:{...spec.features,mezzanine:true,crane:true,opening:true}}
    active.additions=initializeAdditions(active)
    active.additions={...active.additions,link:defaultLink(active),roofOpening:defaultRoofOpening(active),floorOpening:defaultFloorOpening(active)}
    const before=JSON.stringify(active)
    const html=renderToStaticMarkup(createElement(StructureEditor,{...props,spec:active,attempted:true}))
    const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map((m)=>m[1])
    assert.equal(new Set(ids).size,ids.length,`${lang}/${code}: unique field IDs across cards`)
    const summary=renderToStaticMarkup(createElement(StructureSummary,{spec:active}))
    assert.ok(!summary.includes('<input')&&!summary.includes('<select'),'Review never duplicates editable forms')
    assert.equal(JSON.stringify(active),before,'Rendering must not change the draft or confirmations')
    const review=renderToStaticMarkup(createElement(ModelWizard,{spec,step:REVIEW_STEP,visited:REVIEW_STEP,disabled:false,blocked:false,invalid:false,attempted:false,onStep:()=>{},onBuild:()=>{},onCancel:()=>{}}))
    assert.ok(review.includes('aria-valuemax="7"')&&review.includes('aria-valuenow="7"'))
    assert.ok(review.includes(t('mw_build')))
  }
}
console.log('Modeling flow: 7 stages, 4 languages × 3 codes, distinct frame/interfaces, optional parts, error routes, unique targets and read-only summaries passed.')
