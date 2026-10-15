/* 산출물 (M5·M6) — 계산서(HTML, 새 창 → 인쇄/PDF)·도면(DXF 다운로드). 브라우저 안에서 생성(서버 불필요). */
import { buildDxf } from '../drawing/drawings'
import { t } from '../i18n'
import { buildReport } from '../report/report'
import { S } from '../state/store'
import { addMsg, log } from '../state/ui'

const stamp = () => new Date().toISOString().slice(0, 10).split('-').join('')

function download(name: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export function openReport(): void {
  if (!S.built) { addMsg('bot', t('no_model')); return }
  const html = buildReport({ built: S.built, reactions: S.reactions, design: S.design, connections: S.connections })
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }))
  const w = window.open(url, '_blank')
  if (!w) download(`steel_report_${stamp()}.html`, html, 'text/html') // 팝업 차단 시 파일로
  log(t('log_report'), 'ok')
  addMsg('bot', S.design ? t('report_done') : t('report_partial'))
}

export function downloadDrawings(): void {
  if (!S.built) { addMsg('bot', t('no_model')); return }
  const dxf = buildDxf({ spec: S.built.spec, model: S.built.model, connections: S.connections, title: 'STEEL PORTAL FACTORY' })
  download(`steel_drawings_${stamp()}.dxf`, dxf, 'application/dxf')
  log(t('log_dxf'), 'ok')
  addMsg('bot', S.connections ? t('dxf_done') : t('dxf_partial'))
}
