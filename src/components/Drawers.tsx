/* 설정 드로어 — ⚙ MIDAS API. 키는 메모리에만. */
import { useState } from 'react'
import { testConn, type TestOut } from '../agent/session'
import { t } from '../i18n'
import { S, notify, useStore } from '../state/store'

function MapiDrawer({ open, onClose }: { open: boolean; onClose(): void }) {
  const s = useStore()
  const [out, setOut] = useState<TestOut | null>(null)

  async function onTest() {
    setOut({ cls: '', text: t('test_ing') })
    setOut(await testConn())
  }

  return (
    <div className={`drawer${open ? ' on' : ''}`}>
      <header>
        <h1 style={{ fontSize: '.9rem' }}>{t('set_title')}<small>MIDAS Gen NX</small></h1>
        <div className="spacer" />
        <div className="gear" onClick={onClose}>✕</div>
      </header>
      <div className="body">
        <div className="field">
          <label>BASE URL</label>
          <input value={s.baseUrl} onChange={(e) => { S.baseUrl = e.target.value; notify() }} />
        </div>
        <div className="field">
          <label>MAPI-KEY</label>
          <input type="password" autoComplete="off" value={s.mapiKey} placeholder={t('mapi_key_ph')}
            onChange={(e) => { S.mapiKey = e.target.value; notify() }} />
          <div className="hint" dangerouslySetInnerHTML={{ __html: t('mapi_hint_html') }} />
        </div>
        <div className="field">
          <label>{t('save_dir')}</label>
          <input value={s.saveDir} onChange={(e) => { S.saveDir = e.target.value; notify() }} />
          <div className="hint">{t('save_dir_hint')}</div>
        </div>
        <button className="btn btn-c" onClick={() => void onTest()}>{t('conn_test')}</button>
        {out && <div className={`test-out${out.cls ? ' ' + out.cls : ''}`} style={{ display: 'block' }}>{out.text}</div>}
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button className="btn btn-c" onClick={onClose}>{t('save')}</button>
          <button className="btn btn-ghost" onClick={onClose}>{t('close')}</button>
        </div>
      </div>
    </div>
  )
}

export function Drawers({ open, onClose }: { open: boolean; onClose(): void }) {
  return (
    <>
      <div className={`scrim${open ? ' on' : ''}`} onClick={onClose} />
      <MapiDrawer open={open} onClose={onClose} />
    </>
  )
}
