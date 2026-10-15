/* 적용범위 상자 — 스펙 카드 맨 위. 건물 특성 체크 + 범위 판정 결과(block = 실행 막음, warn = 실행 가능·기록). 판정은 domain/scope.ts */
import { checkScope, type ScopeFeatures, type ScopeIssue } from '../domain/scope'
import type { FactorySpec } from '../domain/types'
import { t } from '../i18n'

const FEATS: (keyof ScopeFeatures)[] = ['crane', 'mezzanine', 'multiSpan', 'opening']

/** 판정 문구 (사전 sc_<key>, 인자 = issue.args) */
export const scopeMsg = (i: ScopeIssue): string => (t as (k: string, ...a: unknown[]) => string)(`sc_${i.key}`, ...i.args)

export function ScopeBox({ spec, feat, setFeat, disabled }: { spec: FactorySpec; feat: ScopeFeatures; setFeat(f: ScopeFeatures): void; disabled: boolean }) {
  const r = checkScope(spec, feat)
  return (
    <div className="plan-editor" style={{ paddingBottom: 8 }}>
      <div className="sec-divider" style={{ margin: '0 0 8px' }}>{t('sec_scope')}</div>
      <div className="pe-tip" style={{ marginTop: 0 }}>{t('sc_q')}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', margin: '6px 0' }}>
        {FEATS.map((k) => (
          <label key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '.85rem', cursor: disabled ? 'default' : 'pointer' }}>
            <input type="checkbox" checked={feat[k]} disabled={disabled} onChange={(e) => setFeat({ ...feat, [k]: e.target.checked })} />
            {t(`feat_${k}`)}
          </label>
        ))}
      </div>
      {r.issues.map((i, n) => (
        <div key={n} className="pe-tip" style={{ color: i.level === 'block' ? 'var(--red)' : 'var(--amber)', marginTop: 4 }}>
          {i.level === 'block' ? '⛔' : '⚠'} {scopeMsg(i)}
        </div>
      ))}
      <div className="pe-tip" style={{ marginTop: 6, fontWeight: 600, color: r.blocked ? 'var(--red)' : r.issues.length ? 'var(--amber)' : 'var(--green)' }}>
        {t(r.blocked ? 'sc_blocked' : r.issues.length ? 'sc_warned' : 'sc_ok')}
      </div>
    </div>
  )
}
