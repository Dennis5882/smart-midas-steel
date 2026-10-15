/* GUIDE 사이드바 — 섹션 접기/펼치기, 클릭 = 입력창 타이핑 후 실행(runCmd). 실행 중인 항목은 .running 으로 강조 */
import { useRef, useState } from 'react'
import { GUIDE, type GuideSection } from '../agent/guide'
import { runCmd } from '../agent/session'
import { t, tc } from '../i18n'
import { S, useStore } from '../state/store'

function Section({ sec, running, onRun }: { sec: GuideSection; running: string | null; onRun(key: string, cmd: string): void }) {
  const code = useStore().code
  const [open, setOpen] = useState(sec.open)
  const itemsRef = useRef<HTMLDivElement>(null)
  const maxH = open ? `${itemsRef.current?.scrollHeight ?? 2000}px` : '0'

  return (
    <div className={`gsec${open ? '' : ' closed'}`} data-acc={sec.acc}>
      <div className="gsec-hd" onClick={() => setOpen((o) => !o)}>
        <span className="gsec-ic">{sec.icon}</span><span style={{ flex: 1 }}>{t(`g_${sec.id}`)}</span>
        <span className="garrow" aria-hidden />
      </div>
      <div className="gsec-items" ref={itemsRef} style={{ maxHeight: maxH }}>
        {sec.items.map((it, i) => {
          if ('div' in it) return <div key={i} className="gsec-div" />
          if ('note' in it) return <div key={i} className="gsec-note">{t(it.note)}</div>
          const label = tc(code, it.key), cmd = t(`${it.key}_cmd`)
          return (
            <button key={i} className={`gcmd${running === it.key ? ' running' : ''}`} title={`↵ ${cmd}`} onClick={() => onRun(it.key, cmd)}>
              <i className="gicon">{it.icon}</i><span className="glabel">{label}</span>
              <span className="gsend">↵</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function Guide({ collapsed, onToggle }: { collapsed: boolean; onToggle(): void }) {
  const s = useStore()
  const [running, setRunning] = useState<string | null>(null)
  const onRun = (key: string, cmd: string) => {
    if (running || S.busy) return
    setRunning(key)
    void runCmd(cmd).finally(() => setRunning(null))
  }
  return (
    <aside className={`guide${collapsed ? ' collapsed' : ''}${running || s.busy ? ' busy' : ''}`}>
      <div className="guide-hd">
        <span>{t('guide_title')}</span>
        <button className="guide-tog" onClick={onToggle} title={collapsed ? t('guide_open') : t('guide_close')}>
          {collapsed ? '⟩' : '⟨'}
        </button>
      </div>
      <div className="guide-body">
        {GUIDE.map((sec) => <Section key={sec.id} sec={sec} running={running} onRun={onRun} />)}
      </div>
    </aside>
  )
}
