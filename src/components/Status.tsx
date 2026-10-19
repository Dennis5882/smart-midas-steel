import { systemSource } from '../codes/twSystems'
/* 검토 상태 표시 — 등급 칩, 결과 탭 상단 요약 카드, 채팅 한 줄 요약. 등급 판정은 domain/status.ts (순수). */
import { profileOf, type CodeId } from '../codes'
import { siteCoef, siteSource } from '../codes/twSites'
import { windSource } from '../codes/twWind'
import { checkScope } from '../domain/scope'
import { scopeMsg } from './ScopeBox'
import type { FactorySpec } from '../domain/types'
import type { ConnResult } from '../domain/connections'
import type { DesignResult } from '../domain/design'
import { GRADES, summarizeStatus, type Grade, type Reason, type StatusSummary } from '../domain/status'
import { t, tc } from '../i18n'
import { blockedMembers, restraintKeys, support } from '../domain/validity'

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
      {restraintKeys(spec).map((k) => <div className="kv" key={k}><span className="k">{t(`restraint_${k}`)}</span><span className="v">{t(`restraint_${support(spec, k)}`)}</span></div>)}
      {!!blockedMembers(d) && <p className="mw-error" role="alert">{t('flow_invalid_design')}</p>}
      {d && [...new Set(d.members.flatMap((m) => (m.issues ?? []).filter((i) => i.level === 'blocked').map((i) => i.detail)))].map((text) => <p className="pe-tip" key={text}>{text}</p>)}
      {d?.members.some((m) => m.issues?.some((i) => i.key === 'restraint')) && <p className="pe-tip">{t('restraint_note')}</p>}
      {scope.issues.map((i, n) => <div key={n} className="res-stat" style={{ color: 'var(--amber)', margin: '4px 0 0' }}>⚠ {t('sec_scope')}: {scopeMsg(i)}</div>)}
      <div className="res-stat" style={{ marginTop: 8, marginBottom: 0 }}>
        {used.map((g) => <div key={g}><span className="grade" data-g={g} style={{ marginLeft: 0 }}>{t(`gr_${g}`)}</span> {t(`gr_${g}_d`)}</div>)}
        <div style={{ marginTop: 6 }}>· {t('src_anal')}<br />· {t('src_design', t(profileOf(code).checkLabelKey ?? profileOf(code).labelKey))} {tc(code, 'src_design_why')}</div>
      </div>
    </div>
  )
}

/** 지진 계수 출처 문구 — TW: 표2-1·2-4 자동값 / 사용자 입력(표값) / 표에 없음, CN: 프로젝트 입력 */
export function siteSourceText(spec: FactorySpec): string {
  if (spec.code === 'CN') return t('site_src_CN')
  if (spec.code === 'KR') { const k = spec.korea!; return t('site_src_KR', k.zone === '1' ? 'I' : 'II', k.S, k.site) }
  const s = siteSource(spec.seismic)
  const nf = s.kind === 'table' ? siteCoef(spec.seismic.county, spec.seismic.town, spec.seismic.soil, spec.seismic.nearFault)?.nearFault : undefined
  if (nf?.length) return t('site_src_nf', nf.map((e) => `${e.faults} r = ${e.r} km`).join('; '))
  return s.kind === 'table' ? t('site_src_table') : s.kind === 'user' ? t('site_src_user', s.SDS, s.SD1) : t('site_src_none')
}

/** TW R 출처 — 표1-3 시스템 행과 같으면 행 이름, 다르면 사용자 입력 */
export function rSourceText(spec: FactorySpec): string {
  const s = systemSource(spec.seismic)
  const one = (row: string | null, table: number) => row ? `${t('r_src_table')} ${row}` : t('r_src_user', table)
  return `Rx ${spec.seismic.Rx}: ${one(s.x, s.X.R)} · Ry ${spec.seismic.Ry}: ${one(s.y, s.Y.R)}`
}

/** TW 기본설계풍속 출처 — 耐風規範(2014) 2.4 鄉鎮 구역 */
export function windSourceText(spec: FactorySpec): string {
  const w = windSource(spec.wind.V10, spec.seismic.county, spec.seismic.town)
  if (w.kind === 'none') return t('wind_src_none')
  const base = w.kind === 'table' ? t('wind_src_table', w.V10) : t('wind_src_user', w.V10)
  return w.note ? `${base} — ${t(`wind_note_${w.note}`)}` : base
}
