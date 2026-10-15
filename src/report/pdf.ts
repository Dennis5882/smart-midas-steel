/* Convert our own report markup to paginated PDF content. Text and SVG remain
   selectable/vector; no print dialog, screenshot capture or server upload. */
import type { Content, ContentTable, ContentText, TableCell, TDocumentDefinitions } from 'pdfmake/interfaces'

const FONT = 'Report'
const children = (el: Element) => Array.from(el.childNodes).filter((n): n is Element => n.nodeType === 1)
const classes = (el: Element) => (el.getAttribute('class') ?? '').split(/\s+/)
const COLORS: Record<string, string> = { ok: '#1d8653', ng: '#c43030', 'gr-fail': '#c43030', 'gr-expert': '#5a45c6', 'gr-prelim': '#966000', 'gr-reinforced': '#2f55c9', 'gr-pass': '#1d8653' }

function inline(el: Element): ContentText[] {
  return Array.from(el.childNodes).flatMap((n): ContentText[] => {
    if (n.nodeType === 3) return [{ text: (n.textContent ?? '').replace(/\s+/g, ' ') }]
    if (n.nodeType !== 1) return []
    const e = n as Element, tag = e.tagName.toLowerCase()
    if (tag === 'br') return [{ text: '\n' }]
    const color = classes(e).map((c) => COLORS[c]).find(Boolean)
    return inline(e).map((t) => ({ ...t, ...(tag === 'b' || tag === 'strong' ? { bold: true } : {}), ...(color ? { color } : {}) }))
  })
}

/** Split the HTML's 18-column engineering table into readable groups with
    member identification repeated. Every original column is retained. */
function tables(el: Element): Content[] {
  const rows = Array.from(el.getElementsByTagName('tr')).map((r) => children(r).filter((c) => /^(td|th)$/i.test(c.tagName)))
  if (!rows.length) return []
  const n = rows[0].length, groups: number[][] = []
  if (n <= 8) groups.push(Array.from({ length: n }, (_, i) => i))
  else for (let i = 3; i < n; i += 4) groups.push([0, 1, 2, ...Array.from({ length: Math.min(4, n - i) }, (_, j) => i + j)])
  return groups.map((cols) => ({
    table: {
      headerRows: 1, dontBreakRows: true, keepWithHeaderRows: 1,
      widths: cols.map(() => '*'),
      body: rows.map((row, ri) => cols.map((i): TableCell => ({ text: row[i] ? inline(row[i]) : '', fontSize: n > 8 ? 7.4 : 8, ...(ri === 0 ? { bold: true, fillColor: '#eef1f7', color: '#163678' } : {}) }))),
    },
    layout: { hLineWidth: () => .4, vLineWidth: () => .4, hLineColor: () => '#c8ccd4', vLineColor: () => '#c8ccd4', paddingLeft: () => 4, paddingRight: () => 4, paddingTop: () => 4, paddingBottom: () => 4 },
    margin: [0, 4, 0, 10],
  }))
}

/** Bind section headings to their first content. Table headings repeat on
    continuation pages; a heading must not be left alone above the footer. */
function keepHeadings(items: Content[]): Content[] {
  const out: Content[] = []
  for (let i = 0; i < items.length; i++) {
    const h = items[i] as ContentText
    if (!h.headlineLevel) { out.push(items[i]); continue }
    const heads: ContentText[] = [h]
    while (i + 1 < items.length && (items[i + 1] as ContentText).headlineLevel) heads.push(items[++i] as ContentText)
    const next = items[i + 1]
    if (!next) { out.push(...heads); continue }
    i++
    const pageBreak = heads[0].pageBreak
    for (const head of heads) delete head.pageBreak
    const table = next as ContentTable
    if (table.table) {
      const n = table.table.body[0].length
      table.table.body.unshift(...heads.map((head): TableCell[] => [{ ...head, colSpan: n, border: [false, false, false, false], fillColor: '#ffffff' }, ...Array.from({ length: n - 1 }, () => ({}))]))
      table.table.headerRows = (table.table.headerRows ?? 1) + heads.length
      if (pageBreak) table.pageBreak = pageBreak
      out.push(table)
    } else out.push({ stack: [...heads, next], unbreakable: true, ...(pageBreak ? { pageBreak } : {}) })
  }
  return out
}

export function reportPdfDefinition(doc: Document, serialize: (el: Element) => string): TDocumentDefinitions {
  const body = doc.getElementsByTagName('body')[0]
  if (!body) throw new Error('Report body missing')
  function block(el: Element): Content[] {
    const tag = el.tagName.toLowerCase()
    if (tag === 'table') return tables(el)
    if (tag === 'figure') {
      const original = el.getElementsByTagName('svg')[0]
      if (!original) return []
      const svg = original.cloneNode(true) as Element
      for (const node of [svg, ...Array.from(svg.getElementsByTagName('*'))]) {
        node.setAttribute('font-family', FONT)
        const css = node.getAttribute('style')
        if (css) node.setAttribute('style', css.replace(/font-family\s*:[^;]+/g, `font-family:${FONT}`))
      }
      const box = (svg.getAttribute('viewBox') ?? '').split(/[\s,]+/).map(Number)
      const w = box[2] || 640, h = box[3] || 400
      svg.setAttribute('width', String(w)); svg.setAttribute('height', String(h))
      svg.removeAttribute('style')
      const cap = el.getElementsByTagName('figcaption')[0]?.textContent ?? ''
      return [{ unbreakable: true, stack: [{ svg: serialize(svg), fit: [515, Math.min(480, 515 * h / w)], alignment: 'center' }, { text: cap, alignment: 'center', fontSize: 8, color: '#444', margin: [0, 5, 0, 8] }], margin: [0, 5, 0, 8] }]
    }
    if (tag === 'ul') return [{ ul: children(el).map((li) => ({ text: inline(li) })), unbreakable: true, margin: [0, 3, 0, 8] }]
    if (/^h[123]$/.test(tag)) return [{ text: inline(el), fontSize: tag === 'h1' ? 18 : tag === 'h2' ? 13 : 10, bold: true, color: tag === 'h1' ? '#111111' : '#1f3a8a', margin: [0, tag === 'h1' ? 0 : 12, 0, 6], headlineLevel: +tag[1] }]
    if (tag === 'p' || tag === 'figcaption' || (tag === 'div' && !children(el).some((c) => /^(div|ul|p|table)$/i.test(c.tagName)))) return [{ text: inline(el), margin: [0, 3, 0, 6], ...(classes(el).some((c) => ['note', 'meta'].includes(c)) ? { fontSize: 8, color: '#555' } : {}) }]
    const out: Content[] = []
    for (const n of Array.from(el.childNodes)) {
      if (n.nodeType === 1) out.push(...block(n as Element))
      else if (n.nodeType === 3 && n.textContent?.trim()) out.push({ text: n.textContent.trim(), margin: [0, 2, 0, 4] })
    }
    if (classes(el).includes('dwg') && out.length) (out[0] as ContentText).pageBreak = 'before'
    return out
  }
  const title = doc.getElementsByTagName('title')[0]?.textContent ?? 'Steel report'
  return {
    info: { title, author: 'Smart MIDAS Steel', subject: 'Structural model and preliminary design report' },
    pageSize: 'A4', pageMargins: [40, 36, 40, 42],
    defaultStyle: { font: FONT, fontSize: 9, lineHeight: 1.25 },
    content: keepHeadings(children(body).flatMap(block)),
    footer: (page, pages) => ({ text: `Smart MIDAS Steel  ·  ${page} / ${pages}`, alignment: 'center', fontSize: 8, color: '#666', margin: [0, 12, 0, 0] }),
    pageBreakBefore: (node, queries) => !!node.headlineLevel && queries.getFollowingNodesOnPage().length === 0,
  }
}

export async function createReportPdf(html: string): Promise<{ blob: Blob; pages: number }> {
  const [pdfMakeModule, { PDFDocument }] = await Promise.all([import('pdfmake/build/pdfmake'), import('pdf-lib')])
  const pdfMake = pdfMakeModule.default
  const font = new URL('/fonts/NotoSansCJKkr-Regular.otf', window.location.origin).href
  pdfMake.addFonts({ [FONT]: { normal: font, bold: font, italics: font, bolditalics: font } })
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const definition = reportPdfDefinition(doc, (el) => new XMLSerializer().serializeToString(el))
  const blob = await pdfMake.createPdf(definition).getBlob()
  const bytes = await blob.arrayBuffer()
  const pages = (await PDFDocument.load(bytes)).getPageCount()
  if (!pages || blob.size < 100) throw new Error('Empty PDF output')
  return { blob, pages }
}
