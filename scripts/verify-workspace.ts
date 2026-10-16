/* Typed button actions must not depend on translated command parsing or a mounted composer. */
import assert from 'node:assert/strict'
;(globalThis as any).document = { documentElement: { lang: 'ko', dataset: {} } }
const { S } = await import('../src/state/store')
const { executeAction, openCurrentModel } = await import('../src/agent/session')
const { GUIDE } = await import('../src/agent/guide')
const { setLang } = await import('../src/i18n')
const { TEMPLATES } = await import('../src/domain/templates')
const { defaultSpecFor } = await import('../src/domain/types')

for (const lang of ['ko', 'en', 'zh-TW', 'zh-CN'] as const) {
  setLang(lang)
  for (const code of ['TW', 'CN'] as const) {
    S.code = code; S.lastSpec = defaultSpecFor(code)
    S.built = null; S.activePlan = null; S.draftSpec = null; S.msgs = []
    for (const item of GUIDE[0].items) {
      if (!('action' in item) || item.action.intent !== 'new') continue
      const action = item.action
      await executeAction(action)
      const plan = S.activePlan!
      assert.equal(plan.spec.code, code)
      assert.equal(plan.mode, action.mode)
      assert.equal(S.workspaceView, 'model')
      if (action.tpl) assert.equal(plan.spec.span, TEMPLATES[action.tpl].span)
      const id = plan.id
      S.workspaceView = 'start'
      await executeAction(action)
      assert.equal(S.activePlan!.id, id, 'same action reopens the current editor')
      assert.equal(S.msgs.filter((m) => m.kind === 'plan' || m.role === 'user').length, 0, 'buttons never create chat cards or user messages')
    }
  }
}
const id = S.activePlan!.id
S.busy = true
await executeAction({ intent: 'new', mode: 'template', tpl: 'general', params: {} })
assert.equal(S.activePlan!.id, id, 'busy actions cannot replace the editor')
S.busy = false
S.confirm = { title: '', body: '', ok: '', resolve: () => {} }
await executeAction({ intent: 'new', mode: 'template', tpl: 'general', params: {} })
assert.equal(S.activePlan!.id, id, 'pending confirmation cannot replace the editor')
S.confirm = null
S.workspaceView = 'start'
S.buildEpoch++
openCurrentModel()
assert.equal(S.activePlan!.id, id, 'failed build reopens the same draft')
assert.equal(S.activePlan!.epoch, S.buildEpoch)
await executeAction({ intent: 'clear' })
assert.equal(S.msgs.length, 0)
assert.equal(S.activePlan!.id, id, 'clearing notices preserves the editor')
await executeAction({ intent: 'analyze' })
assert.equal(S.msgs.at(-1)?.kind, 'html', 'missing model is still reported without a composer')
const optimized = { ...S.activePlan!.spec, sections: { ...S.activePlan!.spec.sections, column: 'HN 500x200x10/16' } }
S.built = { spec: optimized } as NonNullable<typeof S.built>
S.opt = {} as NonNullable<typeof S.opt>
S.modelRevision++
openCurrentModel()
assert.equal(S.activePlan!.spec, optimized, 'optimization reopens the current Gen specification')
const optimizedEditorId = S.activePlan!.id
S.draftSpec = { ...optimized, span: 25 }
S.workspaceView = 'start'
openCurrentModel()
assert.equal(S.activePlan!.id, optimizedEditorId, 'resuming after optimization must not discard subsequent edits')
await executeAction({ intent: 'new', mode: 'template', tpl: 'small', params: {} })
const freshId = S.activePlan!.id
{
  assert.equal(S.activePlan!.modelRevision, S.modelRevision, 'a fresh draft after optimization belongs to the current revision')
  openCurrentModel()
  assert.equal(S.activePlan!.id, freshId, 'resuming a fresh draft must not replace it with the earlier optimized model')
}
const { setCode } = await import('../src/agent/session')
const { setConfirmHandler } = await import('../src/components/ConfirmDialog')
const { unavailable } = await import('../src/state/taskFlow')
S.busy = false; S.confirm = null; S.code = 'TW'; S.opt = null
const source = { ...defaultSpecFor('TW'), span: 28, bays: 3, bayList: [6, 7, 8], baySpacing: 8, material: 'SN490B', roofDead: 0.55 }
S.draftSpec = source; S.built = { spec: source } as NonNullable<typeof S.built>
S.analyzed = true; S.design = {} as NonNullable<typeof S.design>; S.connections = {} as NonNullable<typeof S.connections>
const builtBefore = S.built
const editorBefore = S.activePlan
setConfirmHandler(() => false)
await setCode('CN')
assert.equal(S.code, 'TW', 'cancel preserves the project code')
assert.equal(S.activePlan, editorBefore, 'cancel preserves raw editor identity')
setConfirmHandler(() => true)
S.busy = true
await setCode('CN')
assert.equal(S.code, 'TW', 'a running job cannot switch project code')
S.busy = false
await setCode('CN')
assert.equal(S.code, 'CN')
assert.equal(S.draftSpec!.span, 28)
assert.deepEqual(S.draftSpec!.bayList, [6, 7, 8])
assert.equal(S.draftSpec!.material, defaultSpecFor('CN').material)
assert.equal(S.draftSpec!.roofDead, defaultSpecFor('CN').roofDead)
assert.deepEqual(S.draftSpec!.sections, defaultSpecFor('CN').sections)
assert.equal(S.built, builtBefore, 'changing inputs does not modify the existing Gen model or results')
assert.equal(unavailable(S, 'outputs'), 'wf_stale_edited', 'new code inputs cannot export the old model as current')
await setCode('TW')
assert.equal(S.draftSpec!.material, defaultSpecFor('TW').material)
assert.equal(S.draftSpec!.span, 28)
setConfirmHandler(null)
/* 설계기준·언어 예외 규칙 (간체만): 새 작업은 CN 만 / 작업 중 간체 전환은 TW 유지 / 그 밖 언어는 고른 기준 유지 */
{
  const { codeForLang } = await import('../src/state/store')
  assert.equal(codeForLang('zh-CN', 'TW', 'TW', false), 'CN', 'zh-CN new work → CN only')
  assert.equal(codeForLang('zh-CN', 'TW', 'TW', true), 'TW', 'switching to zh-CN mid-work keeps TW')
  assert.equal(codeForLang('zh-TW', 'CN', null, false), 'CN', 'zh-TW keeps current choice (no forced TW)')
  assert.equal(codeForLang('ko', 'CN', 'TW', false), 'TW', 'leaving zh-CN restores the saved choice')
  assert.equal(codeForLang('en', 'TW', 'CN', false), 'CN', 'saved CN survives reload in en')
  assert.equal(codeForLang('en', 'TW', null, false), 'TW', 'no saved choice → current (TW default)')
  assert.equal(codeForLang('ko', 'TW', null, false), 'KR', 'new Korean tab → KR')
  assert.equal(codeForLang('ko', 'TW', 'TW', false), 'TW', 'Korean tab keeps a saved TW choice')
  assert.equal(codeForLang('ko', 'CN', null, true), 'CN', 'switching to Korean mid-work keeps the current code')
  assert.equal(codeForLang('zh-CN', 'KR', 'KR', false), 'CN', 'zh-CN new work → CN even with saved KR')
  assert.equal(codeForLang('en', 'KR', null, false), 'KR', 'leaving Korean without a saved pick keeps KR (no forced TW)')
}
console.log('Workspace passed: 4 languages × TW/CN × 5 modeling actions; resume, guards, project code migration/cancel/stale results')
