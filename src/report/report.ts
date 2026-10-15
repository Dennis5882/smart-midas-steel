/* 구조 계산서 (M5) — 현재 상태(스펙·하중·해석·설계·접합부)로 인쇄용 단일 HTML 을 만든다.
   화면 언어(t)를 따르며, 기호·조항 번호는 원문 표기 유지. 브라우저 인쇄 → PDF. */
import { profileOf } from '../codes'
import type { ConnResult } from '../domain/connections'
import type { DesignResult } from '../domain/design'
import type { OptSummary } from '../domain/optimize'
import { portalGeometry } from '../domain/portal'
import { memberSchedule } from '../domain/schedule'
import { sectionProps } from '../domain/sections'
import { ROLES } from '../domain/types'
import { getLang, htmlLang, t, type I18nKey } from '../i18n'
import type { Built, ReactionSum } from '../state/store'
import { APP_VERSION } from '../version'

const esc = (s: unknown) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!)
const f = (x: number, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : '—')
const row = (cells: unknown[], th = false) => `<tr>${cells.map((c) => (th ? `<th>${esc(c)}</th>` : `<td>${c}</td>`)).join('')}</tr>`
const table = (head: unknown[], rows: unknown[][]) => `<table>${row(head, true)}${rows.map((r) => row(r)).join('')}</table>`
const ok = (r: number) => `<b class="${r > 1 ? 'ng' : 'ok'}">${f(r, 3)}</b>`

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
  const h2 = (k: I18nKey) => parts.push(`<h2>${L(k)}</h2>`)

  /* 1. 설계 개요 */
  h2('rep_s1')
  parts.push(table([t('sv_item'), t('sv_value')], [
    [L('kv_code'), `${esc(t(prof.labelKey))} — ${esc(t('rep_code_refs'))}`],
    [L('kv_span'), `${spec.span} m`], [L('kv_length'), `${spec.bays} × ${spec.baySpacing} = ${f(G.length, 1)} m`],
    [L('kv_eave'), `${spec.eaveHeight} m`], [L('kv_slope'), `${spec.roofSlope} (${f((G.theta * 180) / Math.PI, 1)}°)`],
    [L('kv_base'), L(spec.baseFixity === 'fixed' ? 'base_fixed' : 'base_pinned')],
    [L('f_purlinSp'), `${f(G.sRoof, 3)} m`], [L('f_girtSp'), `${f(G.gWall, 3)} m`], [L('f_postSp'), `${spec.postSpacing} m`], [L('f_sagRods'), spec.sagRods],
    [L('st_node'), model.nodes.length], [L('st_elem'), model.elements.length],
  ]))

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
  parts.push(`<h3>${L('rep_live')}</h3><p>${esc(t('rep_live_txt', f(info.roofLive, 3)))}</p>`)
  parts.push(`<h3>${L('rep_seismic')}</h3>`)
  const si = spec.seismic
  parts.push(table(['', 'X', 'Y'], [
    ['site', `${esc(si.county ?? '')} ${esc(si.town ?? '')} · soil ${si.soil ?? '-'}`, ''],
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
  parts.push(`<p class="note">${esc(t('rep_seismic_txt'))}</p>`)
  parts.push(`<h3>${L('rep_wind')}</h3>`)
  const wi = spec.wind
  parts.push(`<p>V10 = ${wi.V10} m/s, I = ${wi.I}, ${L('f_exposure')} ${wi.exposure}, ${L(wi.enclosure === 'enclosed' ? 'encl_enclosed' : 'encl_partial')}, h = ${f(info.wind.hRef, 2)} m, q(h) = ${f(info.wind.qh, 3)} kN/m², G = ${prof.lateral.gust}</p>`)
  parts.push(table([t('res_lc'), 'X / Y', t('kv_cpRoof'), 'GCpi'], info.wind.cases.map((c) => [c.name, c.dir, f(c.roofCp, 3), f(c.gcpi, 3)])))
  const ac = info.wind.across
  if (ac) parts.push(`<p><b>${L('kv_across')}</b>: W<sub>D,X</sub> = ${f(ac.WDx, 1)} kN, W<sub>D,Y</sub> = ${f(ac.WDy, 1)} kN; W<sub>L</sub> = 0.87(L/B)W<sub>D</sub> → W<sub>L,X</sub> = ${f(ac.WLX, 1)} kN, W<sub>L,Y</sub> = ${f(ac.WLY, 1)} kN; M<sub>T</sub> = 0.28·max(B·W<sub>D</sub>) = ${f(ac.MT, 1)} kN·m; W = ${f(ac.kD, 3)}·W<sub>D</sub> + 0.7(W<sub>L</sub> ± W<sub>T</sub>) (2.12)</p>`)
  parts.push(`<p class="note">${esc(t('rep_wind_txt'))}</p>`)

  /* 4. 하중조합 */
  h2('rep_s4')
  parts.push(table(['#', t('rd_combo')], built.comboNames.map((n, i) => [i + 1, esc(n)])))
  parts.push(`<p class="note">${esc(t('rep_combo_txt'))}</p>`)

  /* 5. 해석 결과 */
  h2('rep_s5')
  if (reactions?.length) parts.push(table([t('res_lc'), 'ΣFX (kN)', 'ΣFY (kN)', 'ΣFZ (kN)'], reactions.map((r) => [esc(r.lc), f(r.fx, 2), f(r.fy, 2), f(r.fz, 2)])))
  else parts.push(`<p>${L('res_empty')}</p>`)

  /* 6. 부재 설계 */
  h2('rep_s6')
  if (design) {
    parts.push(`<p class="note">${esc(t('rd_assump'))}</p>`)
    parts.push(table([t('rd_role'), t('rd_section'), t('rd_elem'), t('rd_combo'), 'Pu', 'Mux', 'Muy', 'Vu', 'φPn', 'φMnx', 'φMny', 'φVn', 'Cb', 'B', 'KL/r', t('rd_eq'), t('rd_ratio')],
      ROLES.filter((r) => design.byRole[r]).map((r) => {
        const m = design.byRole[r]!
        const phiPn = m.forces.P >= 0 ? m.cap.phiPnt : m.cap.phiPnc
        return [L(`role_${r}`), esc(m.section), m.id, esc(m.combo), f(m.forces.P, 1), f(m.forces.Mx, 1), f(m.forces.My, 1), f(m.forces.V, 1),
          f(phiPn, 0), f(m.cap.phiMnx, 1), f(m.cap.phiMny, 1), f(m.cap.phiVn, 0), f(m.Cb, 2), f(m.B, 3), f(m.slender.value, 0), m.eq, ok(m.ratio)]
      })))
    parts.push(`<p class="note">${esc(t('rep_units_kn'))}</p>`)
    const top = [...design.members].sort((a, b) => b.ratio - a.ratio).slice(0, 40)
    parts.push(`<h3>${L('rep_top')}</h3>`)
    parts.push(table([t('rd_elem'), t('rd_role'), t('rd_section'), t('rd_combo'), t('rd_eq'), t('rd_mode'), t('rd_ratio')],
      top.map((m) => [m.id, L(`role_${m.role}`), esc(m.section), esc(m.combo), m.eq, esc(m.cap.mxMode), ok(m.ratio)])))

    if (design.cc?.length) {
      parts.push(`<h3>${L('res_cc')}</h3>`)
      parts.push(table([t('rd_role'), t('cc_zone'), t('cc_area'), 'p+ (kN/m²)', 'p− (kN/m²)', 'n'],
        design.cc.map((c) => [L(`role_${c.role}`), c.zone, f(c.A, 1), f(c.pPos, 3), f(c.pNeg, 3), c.count])))
      parts.push(`<p class="note">${esc(t('cc_note'))}</p>`)
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
    parts.push(`<h3>${L(`cn_type_${c.type}`)} — ${ok(c.ratio)} <span class="note">(${esc(c.combo)}, elem ${c.elem})</span></h3>`)
    parts.push(`<p>${Object.entries(c.dims).map(([k, v]) => `${esc(k)}: ${esc(v)}`).join(' · ')}</p>`)
    if (c.notes.includes('rotTest')) parts.push(`<p class="note">${L('cn_note_rot')}</p>`)
    parts.push(table([t('sv_item'), t('cn_demand'), t('cn_capacity'), t('rd_ratio'), t('sv_clause')],
      c.checks.map((k) => [L(`cn_${k.item}` as I18nKey), `${f(k.demand)} ${k.unit}`, `${f(k.capacity)} ${k.unit}`,
        c.dims.stiffener && k.item === 'flangeBend' ? `${f(k.ratio, 3)} → ${L('cn_stiffener')}` : ok(k.ratio), esc(k.clause)])))
  }
  if (!connections?.length) parts.push(`<p>${L('need_design')}</p>`)

  /* 9. 물량 */
  h2('rep_s9')
  const sch = memberSchedule(spec, model)
  parts.push(table([t('rd_role'), t('rd_section'), t('rep_count'), t('rep_len'), 'kg/m', t('rep_wt')],
    [...sch.rows.map((r) => [L(`role_${r.role}`), esc(r.section), r.count, f(r.length, 1), f(r.kgPerM, 1), f(r.weight, 2)]),
     [`<b>${L('rep_total')}</b>`, '', '', '', '', `<b>${f(sch.total, 2)}</b>`]]))
  parts.push(`<p class="note">${esc(t('rep_wt_note', f((sch.total * 1000) / (spec.span * G.length), 1)))}</p>`)
  if (opt) {
    parts.push(`<h3>${L('res_opt')}</h3>`)
    parts.push(table([t('rd_role'), t('op_before'), t('op_after'), t('rd_ratio'), t('op_gov'), t('op_tons')],
      [...opt.rows.map((r) => [L(`role_${r.role}`), esc(r.before), r.after !== r.before ? `<b>${esc(r.after)}</b>` : esc(r.after), ok(r.ratio),
        L(`op_gov_${r.governs}`), `${f(r.tBefore)} → ${f(r.tAfter)}`]),
       [`<b>${L('op_total')}</b>`, '', '', '', '', `<b>${f(opt.weightBefore)} → ${f(opt.weightAfter)}</b>`]]))
    parts.push(`<p class="note">${esc(t('opt_note'))}</p>`)
  }

  /* 10. 가정·한계 */
  h2('rep_s10')
  parts.push(t('rep_assump_html'))

  const title = t('rep_title')
  return `<!doctype html><html lang="${htmlLang(getLang())}"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  body{font-family:'Noto Sans TC','Noto Sans KR','Noto Sans SC',sans-serif;color:#111;margin:24px auto;max-width:1000px;padding:0 16px;font-size:12px;line-height:1.55}
  h1{font-size:20px;margin:0 0 4px} h2{font-size:15px;margin:22px 0 8px;padding-bottom:4px;border-bottom:2px solid #1f3a8a;color:#1f3a8a}
  h3{font-size:13px;margin:14px 0 6px} table{border-collapse:collapse;width:100%;margin:6px 0 10px;font-size:11px}
  th,td{border:1px solid #c8ccd4;padding:3px 6px;text-align:left} th{background:#eef1f7}
  .ok{color:#1d8653}.ng{color:#c43030}.note{color:#555;font-size:11px} .meta{color:#555} ul{margin:4px 0 0 18px}
  @media print{body{margin:0} h2{break-after:avoid} table{break-inside:auto} tr{break-inside:avoid}}
</style></head><body>
<h1>${esc(title)}</h1>
<div class="meta">${esc(t('rep_project'))} · ${today} · Smart MIDAS Steel v${esc(APP_VERSION)} · MIDAS Gen NX</div>
${parts.join('\n')}
</body></html>`
}
