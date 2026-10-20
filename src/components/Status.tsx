import { systemSource } from '../codes/twSystems'
/* 검토 상태 표시 — 등급 칩, 결과 탭 상단 요약 카드, 채팅 한 줄 요약. 등급 판정은 domain/status.ts (순수). */
import { profileOf, type CodeId } from '../codes'
import { siteCoef, siteSource } from '../codes/twSites'
import { windSource } from '../codes/twWind'
import { checkScope } from '../domain/scope'

import type { FactorySpec } from '../domain/types'
import type { ConnResult } from '../domain/connections'
import type { DesignResult } from '../domain/design'
import { GRADES, summarizeStatus, type Grade, type Reason, type StatusSummary } from '../domain/status'
import { t, tc } from '../i18n'
import { blockedMembers, restraintKeys, support } from '../domain/validity'
import { ACTION_GROUPS, actionItems, type ActionItem } from '../domain/actionItems'
import { actionText } from './ScopeBox'
import { useStore } from '../state/store'

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

/** onJump: 「확인할 것」 [수정] — 호출하는 화면이 넘긴다 (이 모듈은 계산서·작업 모듈도 쓰므로 agent/session 을 가져오지 않는다) */
export function StatusCard({ d, cs, spec, onJump }: { d: DesignResult | null; cs: ConnResult[] | null; spec: FactorySpec; onJump?(field: string): void }) {
  const code: CodeId = spec.code
  const scope = checkScope(spec)
  const sum = summarizeStatus(d, cs, scope)
  const items = actionItems(spec, d, cs, scope)
  const used = GRADES.filter((g) => sum.members[g] + sum.conns[g] > 0 || (g === 'fail' && sum.service.ng) || (g === 'expert' && sum.scopeWarn))
  return (
    <div className="scard"><h3>{t('res_status')} <GradeChip g={sum.overall} /></h3>
      {d && <div className="kv"><span className="k">{t('st_members')} ({d.members.length})</span><span className="v">{counts(sum.members)}</span></div>}
      {d && <div className="kv"><span className="k">{t('st_service')} ({sum.service.total})</span><span className="v">{sum.service.ng ? `NG ${sum.service.ng}` : 'OK'}</span></div>}
      {!!cs?.length && <div className="kv"><span className="k">{t('st_conns')} ({cs.length})</span><span className="v">{counts(sum.conns)}</span></div>}
      {!!blockedMembers(d) && <p className="mw-error" role="alert">{t('flow_invalid_design')}</p>}
      {d && [...new Set(d.members.flatMap((m) => (m.issues ?? []).filter((i) => i.level === 'blocked').map((i) => i.detail)))].map((text) => <p className="pe-tip" key={text}>{text}</p>)}
      {restraintRows(spec, items).map((k) => <div className="kv" key={k}><span className="k">{t(`restraint_${k}`)}</span><span className="v">{t(`restraint_${support(spec, k)}`)}</span></div>)}
      <ActionList items={items} onJump={onJump} />
      <div className="res-stat" style={{ marginTop: 8, marginBottom: 0 }}>
        {used.map((g) => <div key={g}><span className="grade" data-g={g} style={{ marginLeft: 0 }}>{t(`gr_${g}`)}</span> {t(`gr_${g}_d`)}</div>)}
        <div style={{ marginTop: 6 }}>· {t('src_anal')}<br />· {t('src_design', t(profileOf(code).checkLabelKey ?? profileOf(code).labelKey))} {tc(code, 'src_design_why')}</div>
      </div>
    </div>
  )
}

/** 횡지지 상태 행 — 확인·없음은 검토 근거라 항상, 가정은 「확인할 것」에 이미 있으면 생략 */
export function restraintRows(spec: FactorySpec, items: ActionItem[]) {
  const listed = items.some((a) => a.id === 'restraint')
  return restraintKeys(spec).filter((k) => !(listed && support(spec, k) === 'assumed'))
}

/** 결과 카드 — 묶음별 목록, 입력으로 풀리는 항목은 [수정] 으로 그 칸으로 이동 */
export function ActionList({ items, onJump }: { items: ActionItem[]; onJump?(field: string): void }) {
  const s = useStore()
  if (!items.length) return null
  return <div className="ai-list" role="list" aria-label={t('ai_title')}>
    <div className="ai-title">{t('ai_title')}</div>
    {ACTION_GROUPS.filter((g) => items.some((a) => a.group === g)).map((g) => <div key={g} className="ai-group" data-g={g}>
      <div className="ai-head">{t(`ai_${g}`)}</div>
      {items.filter((a) => a.group === g).map((a) => <div key={a.id} className="ai-row" role="listitem">
        <span>{a.scope?.level === 'block' ? '⛔ ' : ''}{actionText(a)}{a.id === 'restraint' && <small className="ai-note">{t('restraint_note')}</small>}</span>
        {a.field && onJump && <button type="button" className="btn btn-ghost ai-go" disabled={s.busy} onClick={() => onJump(a.field!)}>{t('ai_go')}</button>}
      </div>)}
    </div>)}
  </div>
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
