/* 구조 계산서 (M5) — 현재 상태(스펙·하중·해석·설계·접합부)로 인쇄용 단일 HTML 을 만든다.
   화면 언어(t)를 따르며, 기호·조항 번호는 원문 표기 유지. 브라우저 인쇄 → PDF. */
import { profileOf } from '../codes'
import type { ConnResult } from '../domain/connections'
import type { DesignResult } from '../domain/design'
import type { OptSummary } from '../domain/optimize'
import { portalGeometry } from '../domain/portal'
import { LOSS, quantities } from '../domain/quantities'
import { buildDrawingSvgs } from '../drawing/drawings'
import { isoSvg, RATIO_BANDS, ratioColor, ROLE_COLOR } from '../drawing/iso'
import { connGrade, GRADES, roleGrade, summarizeStatus, type Grade, type Graded } from '../domain/status'
import { siteSourceText } from '../components/Status'
import { dimsText } from './dims'
import { scopeMsg } from '../components/ScopeBox'
import { checkScope } from '../domain/scope'
import { sectionProps } from '../domain/sections'
import { lengthText, ROLES } from '../domain/types'
import { getLang, htmlLang, t, tc, type I18nKey } from '../i18n'
import type { Built, ReactionSum } from '../state/store'
import { APP_VERSION } from '../version'

const esc = (s: unknown) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!)
const f = (x: number, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : '—')
const row = (cells: unknown[], th = false) => `<tr>${cells.map((c) => (th ? `<th>${esc(c)}</th>` : `<td>${c}</td>`)).join('')}</tr>`
const table = (head: unknown[], rows: unknown[][], cls = '') => `<table${cls ? ` class="${cls}"` : ''}>${row(head, true)}${rows.map((r) => row(r)).join('')}</table>`
const ok = (r: number) => `<b class="${r > 1 ? 'ng' : 'ok'}">${f(r, 3)}</b>`
/** 등급 칩만 (좁은 표 칸) */
const chip = (g: Grade) => `<span class="gr gr-${g}">${esc(t(`gr_${g}`))}</span>`
/** 등급 칩 — 사유는 괄호로 */
const grade = (g: Graded) => {
  const why = g.reasons.filter((r) => r !== 'ng').map((r) => t(`rs_${r}`)).join(', ')
  return `<span class="gr gr-${g.grade}">${esc(t(`gr_${g.grade}`))}</span>${why ? ` <span class="note">(${esc(why)})</span>` : ''}`
}

const fig = (svg: string, cap: string) => `<figure>${svg}<figcaption>${esc(cap)}</figcaption></figure>`

export interface ReportInput {
  built: Built
  reactions: ReactionSum[] | null
  design: DesignResult | null
  connections: ConnResult[] | null
  /** 단면 자동 최적화를 했으면 물량 장에 변경 전후 표 */
  opt?: OptSummary | null
}

export function buildReport({ built, reactions, design, connections, opt }: ReportInput): string {
  const { spec, model, info } = built
  const prof = profileOf(spec.code)
  const mat = prof.materials[spec.material]
  const G = portalGeometry(spec)
  const today = new Date().toISOString().slice(0, 10)
  const L = (k: I18nKey) => esc(t(k))
  const parts: string[] = []
  const h2 = (k: I18nKey) => parts.push(`<h2>${esc(tc(spec.code, k))}</h2>`)

  /* 검토 상태 요약 — 통과 근거 구분 + 계산 주체 (Gen NX 해석 / 앱 계산) */
  const scope = checkScope(spec)
  const sum = summarizeStatus(design, connections, scope)
  const cnt = (c: Record<string, number>) => GRADES.filter((g) => c[g] > 0).map((g) => `${esc(t(`gr_${g}`))} ${c[g]}`).join(' · ') || '—'
  const used = GRADES.filter((g) => sum.members[g] + sum.conns[g] > 0 || (g === 'fail' && sum.service.ng) || (g === 'expert' && sum.scopeWarn))
  parts.push(`<div class="status"><b>${L('res_status')}</b> ${design ? grade({ grade: sum.overall, reasons: [] }) : L('check_unavailable')}
    ${design ? `<br>${L('st_members')} (${design.members.length}): ${cnt(sum.members)} · ${L('st_service')}: ${sum.service.ng ? `NG ${sum.service.ng}` : 'OK'}` : ''}
    ${connections?.length ? `<br>${L('st_conns')} (${connections.length}): ${cnt(sum.conns)}` : ''}
    ${scope.issues.map((i) => `<br><span class="gr gr-expert">${L('sec_scope')}</span> ${esc(scopeMsg(i))}`).join('')}
    <ul>${used.map((g) => `<li>${grade({ grade: g, reasons: [] })} ${L(`gr_${g}_d`)}</li>`).join('')}</ul>
    <div class="note">${L('src_anal')}<br>${esc(t('src_design', t(prof.labelKey)))} ${esc(tc(spec.code, 'src_design_why'))}</div></div>`)

  /* 1. 설계 개요 */
  h2('rep_s1')
  parts.push(table([t('sv_item'), t('sv_value')], [
    [L('kv_code'), `${esc(t(prof.labelKey))} — ${esc(tc(spec.code, 'rep_code_refs'))}`],
    [L('kv_span'), `${spec.span} m`], [L('kv_length'), lengthText(spec)],
    [L('kv_eave'), `${spec.eaveHeight} m`], [L('kv_slope'), `${spec.roofSlope} (${f((G.theta * 180) / Math.PI, 1)}°)`],
    [L('kv_base'), L(spec.baseFixity === 'fixed' ? 'base_fixed' : 'base_pinned')],
    [L('f_purlinSp'), `${f(G.sRoof, 3)} m`], [L('f_girtSp'), `${f(G.gWall, 3)} m`], [L('f_postSp'), `${spec.postSpacing} m`], [L('f_sagRods'), spec.sagRods],
    [L('st_node'), model.nodes.length], [L('st_elem'), model.elements.length],
  ]))
  const rolesIn = ROLES.filter((r) => model.elements.some((e) => e.role === r))
  parts.push(fig(isoSvg(model, { legend: rolesIn.map((r) => [ROLE_COLOR[r], t(`role_${r}`)]) }), t('rep_fig_model')))

  /* 2. 재료·단면 */
  h2('rep_s2')
  parts.push(`<p>${esc(spec.material)}: Fy = ${mat.fy} MPa, Fu = ${mat.fu} MPa, E = ${mat.E} MPa, γ = ${mat.gamma} kN/m³ (Gen NX ${esc(mat.gen.standard)} ${esc(mat.gen.db)})</p>`)
  const secRows = ROLES.map((r) => ({ r, name: spec.sections[r] })).map(({ r, name }) => {
    const p = sectionProps(name)
    return [L(`role_${r}`), esc(name), f(p.A / 100, 1), f(p.Ix / 1e4, 0), f(p.Zx / 1e3, 0), f(p.rx / 10, 2), f(p.ry / 10, 2)]
  })
  parts.push(table([t('rd_role'), t('rd_section'), 'A (cm²)', 'Ix (cm⁴)', 'Zx (cm³)', 'rx (cm)', 'ry (cm)'], secRows))

  /* 3. 하중 */
  h2('rep_s3')
  parts.push(`<h3>${L('rep_dead')}</h3><p>${esc(t('rep_dead_txt', spec.roofDead, spec.wallDead))}</p>`)
  parts.push(`<h3>${L('rep_live')}</h3><p>${spec.code === 'CN' ? `GB 55001-2021 4.2.8 / GB 50009-2012 5.3: ${f(info.roofLive, 3)} kN/m²` : esc(tc(spec.code, 'rep_live_txt', f(info.roofLive, 3)))}</p>`)
  const kr = info.kr
  if (spec.code === 'KR' && kr) parts.push(`<p>${L('kv_kr_snow')}: S<sub>g</sub> = ${spec.korea!.Sg}, C<sub>e</sub> = ${spec.korea!.Ce}, C<sub>t</sub> = ${spec.korea!.Ct}, I<sub>s</sub> = ${kr.Is} → S<sub>f</sub> = 0.7·C<sub>e</sub>·C<sub>t</sub>·I<sub>s</sub>·S<sub>g</sub> = ${f(kr.Sf, 3)} kN/m² (4.3-1), C<sub>s</sub> = ${f(kr.Cs, 3)}${kr.rain ? `, +${kr.rain} (4.7.1)` : ''}${kr.snowMin ? `, ${L('kv_kr_snowMin')} ${f(kr.snowMin, 3)} (4.3.5)` : ''} → S<sub>s</sub> = ${f(info.snow ?? 0, 3)} kN/m²; ${L(`kr_unbal_${kr.unbalanced}`)}</p>`)
  if (spec.code === 'CN') parts.push(`<p>${L('f_cn_snow')}: s0=${spec.china!.snow} kN/m²; roof=${f(info.snow ?? 0, 3)} kN/m² (GB 50009 table 7.2.1)</p>`)
  parts.push(`<h3>${L('rep_seismic')}</h3>`)
  const si = spec.seismic
  if (spec.code === 'TW') parts.push(table(['', 'X', 'Y'], [
    [L('kv_site'), `${esc(si.county ?? '')} ${esc(si.town ?? '')} · ${si.soil ? L(`soil_${si.soil}`) : '-'}`, ''],
    [L('kv_site_src'), esc(siteSourceText(spec)), ''],
    ['SDS / SD1 / SMS / SM1 / I', `${si.SDS} / ${si.SD1} / ${si.SMS ?? '-'} / ${si.SM1 ?? '-'} / ${si.I}`, ''],
    ['R', si.Rx, si.Ry],
    ['T (s)', f(info.seismic.X.T, 3), f(info.seismic.Y.T, 3)],
    ['V/W', f(info.seismic.X.c, 4), f(info.seismic.Y.c, 4)],
    ['V*/W (I=1)', f(info.seismic.X.cStar, 4), f(info.seismic.Y.cStar, 4)],
    ['W (kN)', f(info.seismic.W, 1), f(info.seismic.W, 1)],
    ['V (kN)', f(info.seismic.X.V, 1), f(info.seismic.Y.V, 1)],
    ...(info.seismic.X.cM !== undefined ? [
      ['V/W · V*/W · V_M/W', `${f(info.seismic.X.cV, 4)} · ${f(info.seismic.X.cMin, 4)} · ${f(info.seismic.X.cM, 4)}`, `${f(info.seismic.Y.cV, 4)} · ${f(info.seismic.Y.cMin, 4)} · ${f(info.seismic.Y.cM, 4)}`],
      ['gov.', info.seismic.X.gov, info.seismic.Y.gov],
      ['M_t = 0.05·B·V (kN·m, 2.14)', f(info.seismic.X.Mt, 1), f(info.seismic.Y.Mt, 1)],
    ] : []),
  ]))
  if (spec.code === 'CN') parts.push(table(['GB/T 50011', 'X', 'Y'], [
    ['αmax / Tg / ζ', `${spec.china!.alphaMax} / ${spec.china!.Tg} / ${spec.china!.damping}`, ''],
    [L('kv_site_src'), esc(siteSourceText(spec)), ''],
    ['T (s)', f(info.seismic.X.T, 3), f(info.seismic.Y.T, 3)],
    ['α(T)', f(info.seismic.X.c, 4), f(info.seismic.Y.c, 4)],
    ['G = D+0.5S (kN)', f(info.seismic.W, 1), ''],
    ['FEk (kN)', f(info.seismic.X.V, 1), f(info.seismic.Y.V, 1)],
  ]))
  if (spec.code === 'KR' && kr) parts.push(table(['KDS 41 17 00', 'X', 'Y'], [
    [L('kv_site_src'), esc(siteSourceText(spec)), ''],
    ['S · F<sub>a</sub> · F<sub>v</sub>', `${kr.spectrum.S} · ${f(kr.spectrum.Fa, 3)} · ${f(kr.spectrum.Fv, 3)}`, ''],
    ['S<sub>DS</sub> / S<sub>D1</sub> (4.2-4·5)', `${f(kr.spectrum.SDS, 4)} / ${f(kr.spectrum.SD1, 4)}`, ''],
    [`${L('kv_kr_sdc')} · ${L('kv_kr_grade')} · I<sub>E</sub>`, `${kr.sdc} · ${kr.grade} · ${kr.IE}`, ''],
    ['R · Ω<sub>0</sub> · C<sub>d</sub> (표 6.2-1)', `${kr.R} · 3 · ${kr.Cd}`, ''],
    ['T<sub>a</sub> (s, 7.2-6)', f(info.seismic.X.T, 3), f(info.seismic.Y.T, 3)],
    ['C<sub>s</sub> (7.2-2~5)', f(info.seismic.X.c, 4), f(info.seismic.Y.c, 4)],
    ['gov.', info.seismic.X.gov, info.seismic.Y.gov],
    ['W (kN)', f(info.seismic.W, 1), ''],
    ['V (kN)', f(info.seismic.X.V, 1), f(info.seismic.Y.V, 1)],
    ['M<sub>ta</sub> = 0.05·B·V (kN·m, 7.2.6.4)', f(info.seismic.X.Mt, 1), f(info.seismic.Y.Mt, 1)],
    [L('kv_kr_orth'), kr.orth30 ? '100% + 30% (8.1.3.3)' : '-', ''],
  ]))
  parts.push(`<p class="note">${esc(tc(spec.code, 'rep_seismic_txt'))}</p>`)
  parts.push(`<h3>${L('rep_wind')}</h3>`)
  const wi = spec.wind
  if (spec.code === 'KR' && kr) parts.push(`<p>V<sub>0</sub> = ${spec.korea!.V0} m/s, K<sub>D</sub> = ${spec.korea!.KD}, K<sub>zr</sub> = ${f(kr.Kzr, 3)} (${L('f_exposure')} ${spec.korea!.exposure}), K<sub>zt</sub> = ${spec.korea!.Kzt}, I<sub>W</sub> = ${kr.Iw} → V<sub>H</sub> = ${f(kr.VH, 2)} m/s, q<sub>H</sub> = ½ρV<sub>H</sub>² = ${f(info.wind.qh, 3)} kN/m² (H = ${f(info.wind.hRef, 2)} m); G<sub>D</sub> X ${f(kr.GD.X, 3)} / Y ${f(kr.GD.Y, 3)} (5.6-2); G<sub>pe</sub> X ${f(kr.Gpe.X, 3)} / Y ${f(kr.Gpe.Y, 3)} (${kr.resonant.X ? '5.6-6' : '5.6-5'}, n<sub>R0</sub> ≈ ${f(kr.nR0, 2)} Hz); C<sub>pi</sub> ${kr.cpi.join(' / ')} (표 5.7-4)</p>`)
  else parts.push(spec.code === 'CN' ? `<p>w0=${spec.china!.w0} kN/m²; terrain ${spec.china!.terrain}; βz=${spec.china!.betaZ}; topography=${spec.china!.topography}; h=${f(info.wind.hRef, 2)} m; μz·w0=${f(info.wind.qh, 3)} kN/m²</p>` : `<p>V10 = ${wi.V10} m/s, I = ${wi.I}, ${L('f_exposure')} ${wi.exposure}, ${L(wi.enclosure === 'enclosed' ? 'encl_enclosed' : 'encl_partial')}, h = ${f(info.wind.hRef, 2)} m, q(h) = ${f(info.wind.qh, 3)} kN/m², G = ${prof.lateral.gust}</p>`)
  parts.push(table([t('res_lc'), 'X / Y', t('kv_cpRoof'), 'GCpi'], info.wind.cases.map((c) => [c.name, c.dir, f(c.roofCp, 3), f(c.gcpi, 3)])))
  const ac = info.wind.across
  if (ac && spec.code === 'KR' && kr) parts.push(`<p><b>${esc(tc(spec.code, 'kv_across'))}</b>: W<sub>D,X</sub> = ${f(ac.WDx, 1)} kN, W<sub>D,Y</sub> = ${f(ac.WDy, 1)} kN; γ = 0.35·D/B ≥ 0.2 → ${f(kr.gammaL.X, 3)} / ${f(kr.gammaL.Y, 3)}; W<sub>LC</sub> = ${f(ac.WLX, 1)} / ${f(ac.WLY, 1)} kN</p>`)
  if (ac && spec.code === 'TW') parts.push(`<p><b>${L('kv_across')}</b>: W<sub>D,X</sub> = ${f(ac.WDx, 1)} kN, W<sub>D,Y</sub> = ${f(ac.WDy, 1)} kN; W<sub>L</sub> = 0.87(L/B)W<sub>D</sub> → W<sub>L,X</sub> = ${f(ac.WLX, 1)} kN, W<sub>L,Y</sub> = ${f(ac.WLY, 1)} kN; M<sub>T</sub> = 0.28·max(B·W<sub>D</sub>) = ${f(ac.MT, 1)} kN·m; W = ${f(ac.kD, 3)}·W<sub>D</sub> + 0.7(W<sub>L</sub> ± W<sub>T</sub>) (2.12)</p>`)
  parts.push(`<p class="note">${esc(tc(spec.code, 'rep_wind_txt'))}</p>`)

  /* 4. 하중조합 */
  h2('rep_s4')
  parts.push(table(['#', t('rd_combo')], built.comboNames.map((n, i) => [i + 1, esc(n)])))
  parts.push(`<p class="note">${esc(tc(spec.code, 'rep_combo_txt'))}</p>`)

  /* 5. 해석 결과 */
  h2('rep_s5')
  if (reactions?.length) parts.push(table([t('res_lc'), 'ΣFX (kN)', 'ΣFY (kN)', 'ΣFZ (kN)'], reactions.map((r) => [esc(r.lc), f(r.fx, 2), f(r.fy, 2), f(r.fz, 2)])))
  else parts.push(`<p>${L('res_empty')}</p>`)

  /* 6. 부재 설계 */
  h2('rep_s6')
  if (design) {
    parts.push(`<p class="note">${esc(tc(spec.code, 'rd_assump'))}</p>`)
    parts.push(table([t('rd_role'), t('rd_section'), t('rd_elem'), t('rd_combo'), 'Pu', 'Mux', 'Muy', 'Vu', 'φPn', 'φMnx', 'φMny', 'φVn', 'Cb', 'B', 'KL/r', t('rd_eq'), t('rd_ratio'), t('rd_status')],
      ROLES.filter((r) => design.byRole[r]).map((r) => {
        const m = design.byRole[r]!
        const phiPn = m.forces.P >= 0 ? m.cap.phiPnt : m.cap.phiPnc
        return [L(`role_${r}`), esc(m.section), m.id, esc(m.combo), f(m.forces.P, 1), f(m.forces.Mx, 1), f(m.forces.My, 1), f(m.forces.V, 1),
          f(phiPn, 0), f(m.cap.phiMnx, 1), f(m.cap.phiMny, 1), f(m.cap.phiVn, 0), f(m.Cb, 2), f(m.B, 3), f(m.slender.value, 0), m.eq, ok(m.ratio), chip(roleGrade(design, r).grade)]
      }), 'wide'))
    const why = ROLES.filter((r) => design.byRole[r]).map((r) => ({ r, g: roleGrade(design, r) })).filter((x) => x.g.reasons.some((k) => k !== 'ng'))
    if (why.length) parts.push(`<p class="note">${why.map((x) => `${L(`role_${x.r}`)}: ${grade(x.g)}`).join(' · ')}</p>`)
    parts.push(`<p class="note">${esc(t('rep_units_kn'))}</p>`)
    const ratioOf = new Map(design.members.map((m) => [m.id, m.ratio]))
    const bandLbl = RATIO_BANDS.map(([hi, c], i): [string, string] => [c, hi === Infinity ? `> ${RATIO_BANDS[i - 1][0].toFixed(1)}` : `${i ? RATIO_BANDS[i - 1][0].toFixed(1) : '0'} – ${hi.toFixed(1)}`])
    parts.push(fig(isoSvg(model, { color: (id) => ratioColor(ratioOf.get(id) ?? 0), legend: bandLbl }), t('rep_fig_ratio')))
    const top = [...design.members].sort((a, b) => b.ratio - a.ratio).slice(0, 40)
    parts.push(`<h3>${L('rep_top')}</h3>`)
    parts.push(table([t('rd_elem'), t('rd_role'), t('rd_section'), t('rd_combo'), t('rd_eq'), t('rd_mode'), t('rd_ratio')],
      top.map((m) => [m.id, L(`role_${m.role}`), esc(m.section), esc(m.combo), m.eq, esc(m.cap.mxMode), ok(m.ratio)])))

    if (design.cc?.length) {
      parts.push(`<h3>${L('res_cc')}</h3>`)
      parts.push(table([t('rd_role'), t('cc_zone'), t('cc_area'), 'p+ (kN/m²)', 'p− (kN/m²)', 'n'],
        design.cc.map((c) => [L(`role_${c.role}`), c.zone, f(c.A, 1), f(c.pPos, 3), f(c.pNeg, 3), c.count])))
      parts.push(`<p class="note">${esc(tc(spec.code, 'cc_note'))}</p>`)
    }
    if (design.col13 !== undefined) {
      parts.push(`<h3>${L('res_seis13')}</h3>`)
      const c = design.col13, om = info.omega
      parts.push(table([t('sv_item'), t('sv_value')], [
        [L('s13_omega'), `Ω<sub>X</sub> = ${f(om.X, 3)}, Ω<sub>Y</sub> = ${f(om.Y, 3)} (Fu<sub>X</sub> = ${f(info.seismic.X.Fu, 3)}, Fu<sub>Y</sub> = ${f(info.seismic.Y.Fu, 3)})`],
        ...(c ? [[L('s13_col'), c.exempt ? esc(t('s13_exempt', f(c.puRatio, 3))) : `${f(c.P, 1)} / ${f(c.phiPn, 1)} kN = ${ok(c.ratio)} (${esc(c.combo)}, elem ${c.elem})`]] : []),
        [L('s13_brace'), '✓'], [L('s13_base'), '✓'], [L('s13_knee'), '✓'],
      ]))
    }

    /* 7. 사용성 */
    h2('rep_s7')
    parts.push(table([t('sv_item'), t('sv_value'), t('sv_limit'), t('rd_ratio'), t('sv_clause'), t('res_lc')], design.service.map((s) => [
      L(`sv_${s.key}`), s.key.endsWith('Defl') ? `${f(s.value * 1000, 1)} mm` : `1/${Math.round(1 / Math.max(s.value, 1e-9))}`,
      s.key.endsWith('Defl') ? `${f(s.limit * 1000, 1)} mm` : `1/${Math.round(1 / s.limit)}`, ok(s.ratio), esc(s.clause), esc(s.case)])))
  } else parts.push(`<p>${L('need_design')}</p>`)

  /* 8. 접합부 */
  h2('rep_s8')
  for (const c of connections ?? []) {
    parts.push(`<h3>${L(`cn_type_${c.type}`)} — ${ok(c.ratio)} ${grade(connGrade(c))} <span class="note">(${esc(c.combo)}, ${L('rd_elem')} ${c.elem})</span></h3>`)
    parts.push(`<p>${esc(dimsText(c.dims))}</p>`)
    if (c.notes.includes('rotTest')) parts.push(`<p class="note">${L('cn_note_rot')}</p>`)
    for (const [note, key] of [['gbFoundation', 'cn_note_foundation'], ['gbJointDetail', 'cn_note_joint'], ['gbBraceDetail', 'cn_note_brace']] as const) if (c.notes.includes(note)) parts.push(`<p class="note">${L(key)}</p>`)
    parts.push(table([t('sv_item'), t('cn_demand'), t('cn_capacity'), t('rd_ratio'), t('sv_clause')],
      c.checks.map((k) => [L(`cn_${k.item}` as I18nKey), `${f(k.demand)} ${k.unit}`, `${f(k.capacity)} ${k.unit}`,
        c.dims.stiffener && k.item === 'flangeBend' ? `${f(k.ratio, 3)} → ${L('cn_stiffener')}` : ok(k.ratio), esc(k.clause)])))
  }
  if (!connections?.length) parts.push(`<p>${L('need_design')}</p>`)

  /* 9. 물량 */
  h2('rep_s9')
  const q = quantities(spec, model, connections)
  const paintOf = new Map(q.paint.map((x) => [`${x.role}|${x.section}`, x.area]))
  parts.push(table([t('rd_role'), t('rd_section'), t('rep_count'), t('rep_len'), 'kg/m', t('rep_wt'), `${t('q_paint')} (m²)`],
    [...q.members.map((r) => [L(`role_${r.role}`), esc(r.section), r.count, f(r.length, 1), f(r.kgPerM, 1), f(r.weight, 2), f(paintOf.get(`${r.role}|${r.section}`) ?? 0, 0)]),
     [`<b>${L('rep_total')}</b>`, '', '', '', '', `<b>${f(q.memberT, 2)}</b>`, `<b>${f(q.paintM2, 0)}</b>`]]))
  parts.push(`<p class="note">${esc(t('rep_wt_note', f((q.memberT * 1000) / (spec.span * G.length), 1)))}</p>`)
  if (q.plates.length) {
    parts.push(`<h3>${L('q_plates')}</h3>`)
    parts.push(table([t('q_conn'), t('q_part'), t('q_size'), t('q_per'), t('q_conns'), t('q_kg')],
      [...q.plates.map((x) => [L(`cn_type_${x.type}`), `${L(`q_part_${x.part}`)}${x.est ? ' *' : ''}`, esc(x.size), x.perConn, x.conns, f(x.kg, 1)]),
       [`<b>${L('rep_total')}</b>`, '', '', '', '', `<b>${f(q.plateT * 1000, 1)}</b>`]]))
    parts.push(`<h3>${L('q_bolts')}</h3>`)
    parts.push(table([t('q_conn'), t('q_part'), t('q_size'), t('q_per'), t('q_conns'), t('q_total')],
      q.bolts.map((x) => [L(`cn_type_${x.type}`), L(`q_${x.kind}`), x.size, x.perConn, x.conns, x.total])))
  }
  parts.push(`<h3>${L('q_summary')}</h3>`)
  parts.push(table([t('sv_item'), t('sv_value')], [
    [L('q_memberT'), `${f(q.memberT, 2)} t`], [L('q_plateT'), `${f(q.plateT, 2)} t`], [L('q_netT'), `<b>${f(q.netT, 2)} t</b>`],
    [L('q_loss'), esc(t('q_loss_v', LOSS.member * 100, LOSS.plate * 100))], [L('q_orderT'), `<b>${f(q.orderT, 2)} t</b>`],
    [L('q_paint'), `${f(q.paintM2, 0)} m²`], [L('q_weld'), `${L('q_cjp')} ${f(q.cjpM, 1)} m · ${L('q_fillet')} ${f(q.filletM, 1)} m *`],
  ]))
  parts.push(`<p class="note">${L('q_note')}</p>`)
  if (opt) {
    parts.push(`<h3>${L('res_opt')}</h3>`)
    parts.push(table([t('rd_role'), t('op_before'), t('op_after'), t('rd_ratio'), t('op_gov'), t('op_tons')],
      [...opt.rows.map((r) => [L(`role_${r.role}`), esc(r.before), r.after !== r.before ? `<b>${esc(r.after)}</b>` : esc(r.after), ok(r.ratio),
        L(`op_gov_${r.governs}`), `${f(r.tBefore)} → ${f(r.tAfter)}`]),
       [`<b>${L('op_total')}</b>`, '', '', '', '', `<b>${f(opt.weightBefore)} → ${f(opt.weightAfter)}</b>`]]))
    parts.push(`<p class="note">${esc(tc(spec.code, 'opt_note'))}</p>`)
  }

  /* 10. 가정·한계 */
  h2('rep_s10')
  if (spec.code === 'KR') parts.push(`<p>${L('kr_scope_note')}</p><p>${L('rd_assump_KR')}</p><p>${L('kr_note_phase2')}</p><p>${L('kr_note_service')}</p>`)
  else if (spec.code === 'CN') parts.push(`<p>${L('cn_scope_note')}</p><p>${L('rd_assump_CN')}</p><p>${L('cn_note_foundation')}</p><p>${L('cn_note_joint')}</p><p>${L('cn_note_brace')}</p>`)
  else parts.push(t('rep_assump_html'))

  /* 부록. 도면 — DXF 와 같은 시트 (SVG) */
  parts.push(`<section class="dwg"><h2>${esc(tc(spec.code, 'rep_s11'))}</h2><p class="note">${L('rep_dwg_note')}</p>`)
  for (const sh of buildDrawingSvgs({ spec, model, connections, title: t('rep_title') })) parts.push(fig(sh.svg, sh.name))
  parts.push('</section>')

  const title = t('rep_title')
  return `<!doctype html><html lang="${htmlLang(getLang())}"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  body{font-family:'Noto Sans TC','Noto Sans KR','Noto Sans SC',sans-serif;color:#111;margin:24px auto;max-width:1000px;padding:0 16px;font-size:12px;line-height:1.55}
  h1{font-size:20px;margin:0 0 4px} h2{font-size:15px;margin:22px 0 8px;padding-bottom:4px;border-bottom:2px solid #1f3a8a;color:#1f3a8a}
  h3{font-size:13px;margin:14px 0 6px} table{border-collapse:collapse;width:100%;margin:6px 0 10px;font-size:11px}
  th,td{border:1px solid #c8ccd4;padding:3px 6px;text-align:left} th{background:#eef1f7}
  .status{border:1px solid #c8ccd4;border-radius:4px;padding:8px 12px;margin:10px 0;background:#f7f8fb}
  .gr{display:inline-block;padding:0 6px;border:1px solid currentColor;border-radius:8px;font-size:10.5px;font-weight:600;white-space:nowrap}
  table.wide{font-size:9.5px} table.wide th,table.wide td{padding:2px 3px}
  .gr-fail{color:#c43030}.gr-expert{color:#5a45c6}.gr-prelim{color:#b56d00}.gr-reinforced{color:#2f55c9}.gr-pass{color:#1d8653}
  .ok{color:#1d8653}.ng{color:#c43030}.note{color:#555;font-size:11px} .meta{color:#555} ul{margin:4px 0 0 18px}
  figure{margin:10px 0 14px;text-align:center;break-inside:avoid} figure svg{border:1px solid #e1e4ea;background:#fff} figcaption{font-size:11px;color:#444;margin-top:4px}
  @page{size:A4;margin:14mm 12mm}
  @media print{body{margin:0;max-width:none} h2{break-after:avoid} table{break-inside:auto} tr{break-inside:avoid} .dwg{break-before:page} .dwg figure{break-inside:avoid}}
</style></head><body>
<h1>${esc(title)}</h1>
<div class="meta">${esc(t('rep_project'))} · ${today} · Smart MIDAS Steel v${esc(APP_VERSION)} · MIDAS Gen NX</div>
${parts.join('\n')}
</body></html>`
}
