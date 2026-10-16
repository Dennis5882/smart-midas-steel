/* 검토 상태 표시 — 등급 칩, 결과 탭 상단 요약 카드, 채팅 한 줄 요약. 등급 판정은 domain/status.ts (순수). */
import { profileOf, type CodeId } from '../codes'
import { siteSource } from '../codes/twSites'
import { checkScope } from '../domain/scope'
import { scopeMsg } from './ScopeBox'
import type { FactorySpec } from '../domain/types'
import type { ConnResult } from '../domain/connections'
import type { DesignResult } from '../domain/design'
import { GRADES, summarizeStatus, type Grade, type Reason, type StatusSummary } from '../domain/status'
import { t, tc } from '../i18n'

export function GradeChip({ g, reasons }: { g: Grade; reasons?: Reason[] }) {
  const why = (reasons ?? []).filter((r) => r !== 'ng').map((r) => t(`rs_${r}`)).join(' · ')
  return <span className="grade" data-g={g} title={why || undefined}>{t(`gr_${g}`)}{why ? ` · ${why}` : ''}</span>
}

/** 등급별 개수 → '통과 240 · 예비검토 164' (0 은 생략) */
const counts = (c: Record<Grade, number>) => GRADES.filter((g) => c[g] > 0).map((g) => `${t(`gr_${g}`)} ${c[g]}`).join(' · ') || '—'

/** 채팅용 한 줄 (HTML) */
export function statusLine(sum: StatusSummary): string {
  return `<span class="grade" data-g="${sum.overall}">${t(`gr_${sum.overall}`)}</span> ${t('st_members')} ${counts(sum.members)}` +
    (sum.service.total ? ` / ${t('st_service')} ${sum.service.ng ? `NG ${sum.service.ng}` : 'OK'}` : '') +
    (GRADES.some((g) => sum.conns[g]) ? ` / ${t('st_conns')} ${counts(sum.conns)}` : '')
}

export function StatusCard({ d, cs, spec }: { d: DesignResult | null; cs: ConnResult[] | null; spec: FactorySpec }) {
  const code: CodeId = spec.code
  const scope = checkScope(spec)
  const sum = summarizeStatus(d, cs, scope)
  const used = GRADES.filter((g) => sum.members[g] + sum.conns[g] > 0 || (g === 'fail' && sum.service.ng) || (g === 'expert' && sum.scopeWarn))
  return (
    <div className="scard"><h3>{t('res_status')} <GradeChip g={sum.overall} /></h3>
      {d && <div className="kv"><span className="k">{t('st_members')} ({d.members.length})</span><span className="v">{counts(sum.members)}</span></div>}
      {d && <div className="kv"><span className="k">{t('st_service')} ({sum.service.total})</span><span className="v">{sum.service.ng ? `NG ${sum.service.ng}` : 'OK'}</span></div>}
      {!!cs?.length && <div className="kv"><span className="k">{t('st_conns')} ({cs.length})</span><span className="v">{counts(sum.conns)}</span></div>}
      {scope.issues.map((i, n) => <div key={n} className="res-stat" style={{ color: 'var(--amber)', margin: '4px 0 0' }}>⚠ {t('sec_scope')}: {scopeMsg(i)}</div>)}
      <div className="res-stat" style={{ marginTop: 8, marginBottom: 0 }}>
        {used.map((g) => <div key={g}><span className="grade" data-g={g} style={{ marginLeft: 0 }}>{t(`gr_${g}`)}</span> {t(`gr_${g}_d`)}</div>)}
        <div style={{ marginTop: 6 }}>· {t('src_anal')}<br />· {t('src_design', t(profileOf(code).labelKey))} {tc(code, 'src_design_why')}</div>
      </div>
    </div>
  )
}

/** 지진 계수 출처 문구 — TW: 표2-1·2-4 자동값 / 사용자 입력(표값) / 표에 없음, CN: 프로젝트 입력 */
export function siteSourceText(spec: FactorySpec): string {
  if (spec.code === 'CN') return t('site_src_CN')
  if (spec.code === 'KR') { const k = spec.korea!; return t('site_src_KR', k.zone === '1' ? 'I' : 'II', k.S, k.site) }
  const s = siteSource(spec.seismic)
  return s.kind === 'table' ? t('site_src_table') : s.kind === 'user' ? t('site_src_user', s.SDS, s.SD1) : t('site_src_none')
}
