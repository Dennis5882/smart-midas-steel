/* 확인 창 (AlertDialog 역할) — Gen NX 문서를 바꾸는 작업(모델 교체·복원) 전에. 네이티브 <dialog> 모달: 배경 inert·포커스 가둠·닫으면 원래 버튼으로 포커스 복귀.
   사용: if (await confirmAction({ title, body, ok })) … — 상태는 S.confirm 하나 (store 패턴). */
import { useEffect, useRef, useState } from 'react'
import { t } from '../i18n'
import { S, notify, useStore } from '../state/store'

/** choice — 확인 창 안의 선택지(라디오). value = 처음 선택된 값, 확인하면 고른 값으로 답한다 */
export interface ConfirmChoice { legend: string; value: string; options: { value: string; label: string; desc: string }[] }
export interface ConfirmReq { title: string; body: string; ok: string; danger?: boolean; skipKey?: string; choice?: ConfirmChoice }
const skipped = new Set<string>()

/** 화면 없는 실행(회귀·라이브 스크립트)용 응답기 — 설정하면 확인 창 대신 이것이 답한다 */
let handler: ((req: ConfirmReq) => boolean | Promise<boolean>) | null = null
export const setConfirmHandler = (h: typeof handler) => { handler = h }

/** 확인 창을 띄우고 결과를 기다린다. skipKey 가 있으면 '이번 세션에서 다시 묻지 않기' 제공 */
export function confirmAction(req: ConfirmReq): Promise<boolean> {
  if (handler) return Promise.resolve(handler(req))
  if (req.skipKey && skipped.has(req.skipKey)) return Promise.resolve(true)
  return new Promise((resolve) => { S.confirm = { ...req, resolve }; notify() })
}

/** 선택지가 있는 확인 창 — 고른 값, 취소면 null. 매번 고르게 하므로 '다시 묻지 않기' 없음. 화면 없는 실행은 handler 가 true 면 처음 값 */
export function confirmChoice(req: ConfirmReq & { choice: ConfirmChoice }): Promise<string | null> {
  const ask = { ...req, skipKey: undefined }
  if (handler) return Promise.resolve(handler(ask)).then((ok) => (ok ? req.choice.value : null))
  return new Promise((resolve) => { S.confirm = { ...ask, resolve: (ok, value) => resolve(ok ? value ?? req.choice.value : null) }; notify() })
}

export function ConfirmDialog() {
  const s = useStore()
  const c = s.confirm
  const ref = useRef<HTMLDialogElement>(null)
  const okRef = useRef<HTMLButtonElement>(null)
  const [skip, setSkip] = useState(false)
  const [pick, setPick] = useState('')

  useEffect(() => {
    const el = ref.current
    if (!c || !el) return
    setSkip(false)
    setPick(c.choice?.value ?? '')
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    el.showModal()
    okRef.current?.focus()
    return () => { el.close(); if (previous?.isConnected) previous.focus() }
  }, [c])

  const done = (ok: boolean) => {
    if (!c) return
    if (ok && skip && c.skipKey) skipped.add(c.skipKey)
    S.confirm = null
    notify()
    c.resolve(ok, c.choice ? pick : undefined)
  }

  return (
    <dialog ref={ref} className="confirm-dlg" role="alertdialog" aria-labelledby="cfm-title" aria-describedby="cfm-body"
      onCancel={(e) => { e.preventDefault(); done(false) }}>
      {c && <>
        <h2 id="cfm-title">{c.title}</h2>
        {c.choice && <fieldset className="gen-content cfm-choice">
          <legend>{c.choice.legend}</legend>
          {c.choice.options.map((o) => (
            <label key={o.value} className="gc-opt"><input type="radio" name="cfm-choice" checked={pick === o.value} onChange={() => setPick(o.value)} /> <b>{o.label}</b><span className="mw-note">{o.desc}</span></label>
          ))}
        </fieldset>}
        <p id="cfm-body" dangerouslySetInnerHTML={{ __html: c.body }} />
        {c.skipKey && <label className="cfm-skip"><input type="checkbox" checked={skip} onChange={(e) => setSkip(e.target.checked)} /> {t('cfm_skip')}</label>}
        <div className="cfm-row">
          <button className="btn btn-ghost" onClick={() => done(false)}>{t('cancel')}</button>
          <button ref={okRef} className={`btn ${c.danger ? 'btn-danger' : 'btn-c'}`} onClick={() => done(true)}>{c.ok}</button>
        </div>
      </>}
    </dialog>
  )
}
