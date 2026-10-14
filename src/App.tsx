import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { CODE_IDS, PROFILES, profileOf } from '@/codes'
import { buildPortal } from '@/domain/portal'
import { DEFAULT_SPEC, type ElementRole, type FactoryModel, type FactorySpec } from '@/domain/types'
import { sendModel } from '@/actions/send'
import { S } from '@/state/store'
import { LANG_DEFS, normalizeLang, setLang, t, useLang } from '@/i18n'

const ROLES: ElementRole[] = ['column', 'rafter', 'purlin', 'girt', 'strut']
const selectCls = 'h-9 rounded-md border border-input bg-background px-2 text-sm'

export function App() {
  const lang = useLang()
  const [spec, setSpec] = useState<FactorySpec>(DEFAULT_SPEC)
  const [model, setModel] = useState<FactoryModel | null>(null)
  const [key, setKey] = useState('')
  const [status, setStatus] = useState('')
  const profile = profileOf(spec.code)

  const send = async () => {
    if (!model) return
    S.mapiKey = key
    try {
      await sendModel(spec, model, (step) => setStatus(t('sending', step)))
      setStatus(t('sent'))
    } catch (e) {
      setStatus(t('send_fail', e instanceof Error ? e.message : String(e)))
    }
  }

  return (
    <main className="mx-auto max-w-3xl space-y-4 p-6">
      <Card>
        <CardHeader>
          <CardTitle>{t('app_title')}</CardTitle>
          <CardDescription>{t('app_desc', __APP_VERSION__)}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm">
            {t('lang_label')}
            <select className={selectCls} value={lang} onChange={(e) => { const l = normalizeLang(e.target.value); if (l) setLang(l) }}>
              {LANG_DEFS.map((d) => <option key={d.code} value={d.code}>{d.label}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            {t('code_label')}
            <select className={selectCls} value={spec.code} onChange={(e) => setSpec({ ...spec, code: e.target.value as FactorySpec['code'] })}>
              {CODE_IDS.map((id) => <option key={id} value={id}>{t(PROFILES[id].labelKey)}</option>)}
            </select>
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4">
          <Button onClick={() => setModel(buildPortal(spec))}>{t('generate')}</Button>
          {model && (
            <div className="space-y-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <input type="password" autoComplete="off" className={selectCls + ' w-72'} placeholder={t('key_label')} value={key} onChange={(e) => setKey(e.target.value)} />
                <Button variant="secondary" disabled={!key} onClick={send}>{t('send')}</Button>
                {status && <span className="text-muted-foreground">{status}</span>}
              </div>
              <p className="font-medium">{t('summary', model.nodes.length, model.elements.length)}</p>
              <ul className="text-muted-foreground">
                {ROLES.map((r) => (
                  <li key={r}>{t(`role_${r}` as const)}: {model.elements.filter((e) => e.role === r).length}</li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">{t('combos_title')}</CardTitle></CardHeader>
        <CardContent>
          <ul className="space-y-1 font-mono text-sm">
            {profile.combos({ heavyLive: false }).map((c) => (
              <li key={c.ref}>({c.ref}) {c.terms.map(([k, f]) => `${f}${k}`).join(' + ')}</li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </main>
  )
}
