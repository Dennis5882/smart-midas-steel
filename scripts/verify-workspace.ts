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
console.log('Workspace passed: 4 languages × TW/CN × 5 modeling actions; resume, busy/confirmation guards, notices')
