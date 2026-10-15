/* 산출물 (M5·M6) — 계산서(PDF 직접 다운로드 / HTML 새 창)·도면(DXF)·물량(CSV).
   브라우저 안에서 생성하며 PDF는 파일 생성·페이지 수 확인 후 다운로드한다. */
import { buildDxf } from '../drawing/drawings'
import { getLang, t, lt } from '../i18n'
import { buildReport } from '../report/report'
import { LOSS, quantities } from '../domain/quantities'
import type { I18nKey } from '../i18n'
import { S } from '../state/store'
import { addMsg, log } from '../state/ui'
import { beginJob, checkCancel, endJob, failMsg, stage } from './job'

const stamp = () => new Date().toISOString().slice(0, 10).split('-').join('')

function download(name: string, text: string, type: string): void {
  downloadBlob(name, new Blob([text], { type }))
}

function downloadBlob(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export function openReport(): void {
  if (!S.built) { addMsg('bot', lt('no_model')); return }
  const html = reportHtml()
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }))
  const w = window.open(url, '_blank')
  if (!w) download(`steel_report_${stamp()}.html`, html, 'text/html') // 팝업 차단 시 파일로
  log(t('log_report'), 'ok')
  addMsg('bot', S.design ? t('report_done') : t('report_partial'))
}

const reportHtml = () => buildReport({ built: S.built!, reactions: S.reactions, design: S.design, connections: S.connections, opt: S.opt })

/** Generate and validate the PDF locally before starting the file download. */
export async function downloadReportPdf(): Promise<void> {
  if (!S.built) { addMsg('bot', lt('no_model')); return }
  if (!beginJob('pdf')) return
  try {
    stage('pdf_start')
    const name = `steel_report_${S.built.spec.code}_${getLang()}_${stamp()}.pdf`
    const html = reportHtml()
    const { createReportPdf } = await import('../report/pdf')
    checkCancel()
    const { blob, pages } = await createReportPdf(html)
    checkCancel()
    downloadBlob(name, blob)
    log(t('log_report'), 'ok')
    addMsg('bot', lt('pdf_done', name, pages, (blob.size / 1024).toFixed(0), new Date().toLocaleString()))
  } catch (e) {
    addMsg('bot', failMsg(e, (m) => t('pdf_failed', m)))
  } finally {
    endJob()
  }
}

/** 물량 CSV (UTF-8 BOM — 엑셀에서 바로 열림) */
export function downloadQuantities(): void {
  if (!S.built) { addMsg('bot', lt('no_model')); return }
  const { spec, model } = S.built
  const q = quantities(spec, model, S.connections)
  const L = (k: string) => t(k as I18nKey)
  const cell = (v: unknown) => { const s = String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
  const rows: unknown[][] = [
    [L('q_members')], [L('rd_role'), L('rd_section'), L('rep_count'), L('rep_len'), 'kg/m', L('rep_wt'), `${L('q_paint')} (m2)`],
    ...q.members.map((r) => [L(`role_${r.role}`), r.section, r.count, r.length.toFixed(2), r.kgPerM.toFixed(2), r.weight.toFixed(3), (q.paint.find((x) => x.role === r.role && x.section === r.section)?.area ?? 0).toFixed(1)]),
    [], [L('q_plates')], [L('q_conn'), L('q_part'), L('q_size'), L('q_per'), L('q_conns'), L('q_kg'), L('q_est')],
    ...q.plates.map((x) => [L(`cn_type_${x.type}`), L(`q_part_${x.part}`), x.size, x.perConn, x.conns, x.kg.toFixed(1), x.est ? '*' : '']),
    [], [L('q_bolts')], [L('q_conn'), L('q_part'), L('q_size'), L('q_per'), L('q_conns'), L('q_total')],
    ...q.bolts.map((x) => [L(`cn_type_${x.type}`), L(`q_${x.kind}`), x.size, x.perConn, x.conns, x.total]),
    [], [L('q_summary')],
    [L('q_memberT'), q.memberT.toFixed(3), 't'], [L('q_plateT'), q.plateT.toFixed(3), 't'], [L('q_netT'), q.netT.toFixed(3), 't'],
    [L('q_loss'), t('q_loss_v', LOSS.member * 100, LOSS.plate * 100)], [L('q_orderT'), q.orderT.toFixed(3), 't'],
    [L('q_paint'), q.paintM2.toFixed(1), 'm2'], [`${L('q_weld')} — ${L('q_cjp')}`, q.cjpM.toFixed(1), 'm'], [`${L('q_weld')} — ${L('q_fillet')}`, q.filletM.toFixed(1), 'm'],
  ]
  download(`steel_quantities_${stamp()}.csv`, '\ufeff' + rows.map((r) => r.map(cell).join(',')).join('\r\n'), 'text/csv;charset=utf-8')
  log(t('log_csv'), 'ok')
  addMsg('bot', lt('csv_done', q.netT.toFixed(2), q.orderT.toFixed(2)))
}

export function downloadDrawings(): void {
  if (!S.built) { addMsg('bot', lt('no_model')); return }
  const dxf = buildDxf({ spec: S.built.spec, model: S.built.model, connections: S.connections, title: 'STEEL PORTAL FACTORY' })
  download(`steel_drawings_${stamp()}.dxf`, dxf, 'application/dxf')
  log(t('log_dxf'), 'ok')
  addMsg('bot', S.connections ? t('dxf_done') : t('dxf_partial'))
}
