/* Render the same PDF definition used in the browser, using the bundled font.
   Run node --import tsx scripts/verify-pdf.ts. No Gen/API key required. */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'
import { DOMParser, XMLSerializer } from '@xmldom/xmldom'
import pdfMake from 'pdfmake'
import { PDFDocument } from 'pdf-lib'
import { reportFontFile, reportPdfDefinition } from '../src/report/pdf'
import * as fontkit from 'fontkit'
import { buildPortal } from '../src/domain/portal'
import { buildLoadPayloads } from '../src/domain/loads'
import { runConnections } from '../src/domain/connections'
import { runDesign } from '../src/domain/design'
import { FIXTURE, decodeResults, fixtureFor } from './tw-golden'
import {additionSpec,phase5Spec,phase6Spec} from './addition-spec'
import {addKo,addEn,addTW,addCN} from '../src/i18n/dict/additions'
import type { ReportInput } from '../src/report/report'
import { krSynthetic } from './kr-synth'
import { defaultSpecFor } from '../src/domain/types'

;(globalThis as any).document = { documentElement: { lang: 'ko', dataset: {} } }
const { buildReport } = await import('../src/report/report')
const { setLang } = await import('../src/i18n')
pdfMake.setLocalAccessPolicy((path) => path.startsWith(resolve('public/fonts')))
pdfMake.setUrlAccessPolicy(() => false)
mkdirSync('output/pdf', { recursive: true })
const fx = JSON.parse(gunzipSync(readFileSync(FIXTURE)).toString())
const model = buildPortal(fx.spec), loads = buildLoadPayloads(fx.spec, model), results = decodeResults(fx.results)
const input: ReportInput = { built: { spec: fx.spec, model, info: loads.info, cases: Object.values(loads.STLD).map((v: any) => v.NAME), combos: Object.keys(loads.info.comboKind).length, comboNames: Object.keys(loads.info.comboKind) }, reactions: fx.reactions, design: runDesign(fx.spec, model, loads.info, results), connections: runConnections(fx.spec, model, loads.info, results) }
/* KR — 합성 결과(경로·글꼴 확인용) */
const krSpec = defaultSpecFor('KR'), kr = krSynthetic(krSpec)
const krInput: ReportInput = { built: { spec: krSpec, model: kr.model, info: kr.loads.info, cases: kr.cases, combos: kr.combos.length, comboNames: kr.combos }, reactions: fx.reactions, design: runDesign(krSpec, kr.model, kr.loads.info, kr.results), connections: runConnections(krSpec, kr.model, kr.loads.info, kr.results) }
/* CN — 라이브 정답 세트 (GB 51022 문구·隅撑 등 CN 전용 글자) */
const cfx = JSON.parse(gunzipSync(readFileSync(fixtureFor('CN'))).toString())
const cModel = buildPortal(cfx.spec), cLoads = buildLoadPayloads(cfx.spec, cModel), cRes = decodeResults(cfx.results)
const cnInput: ReportInput = { built: { spec: cfx.spec, model: cModel, info: cLoads.info, cases: Object.values(cLoads.STLD).map((v: any) => v.NAME), combos: Object.keys(cLoads.info.comboKind).length, comboNames: Object.keys(cLoads.info.comboKind) }, reactions: cfx.reactions, design: runDesign(cfx.spec, cModel, cLoads.info, cRes), connections: runConnections(cfx.spec, cModel, cLoads.info, cRes) }
const aSpec=additionSpec(defaultSpecFor('TW')),aModel=buildPortal(aSpec),aLoads=buildLoadPayloads(aSpec,aModel)
const additionInput:ReportInput={built:{spec:aSpec,model:aModel,info:aLoads.info,cases:Object.values(aLoads.STLD).map((v:any)=>v.NAME),combos:Object.keys(aLoads.info.comboKind).length,comboNames:Object.keys(aLoads.info.comboKind)},reactions:null,design:null,connections:null}
const pSpec=phase5Spec(defaultSpecFor('TW')),pModel=buildPortal(pSpec),pLoads=buildLoadPayloads(pSpec,pModel)
const phase5Input:ReportInput={built:{spec:pSpec,model:pModel,info:pLoads.info,cases:Object.values(pLoads.STLD).map((v:any)=>v.NAME),combos:Object.keys(pLoads.info.comboKind).length,comboNames:Object.keys(pLoads.info.comboKind)},reactions:null,design:null,connections:null}
const qSpec=phase6Spec(defaultSpecFor('TW')),qModel=buildPortal(qSpec),qLoads=buildLoadPayloads(qSpec,qModel)
const phase6Input:ReportInput={built:{spec:qSpec,model:qModel,info:qLoads.info,cases:Object.values(qLoads.STLD).map((v:any)=>v.NAME),combos:Object.keys(qLoads.info.comboKind).length,comboNames:Object.keys(qLoads.info.comboKind)},reactions:null,design:null,connections:null}
for (const [code, inp] of [['TW', input], ['KR', krInput], ['CN', cnInput], ['ADDITIONS',additionInput],['PHASE5',phase5Input],['PHASE6',phase6Input]] as const) for (const lang of ['ko', 'en', 'zh-TW', 'zh-CN'] as const) {
  setLang(lang)
  const html = buildReport(inp)
  const doc = new DOMParser().parseFromString(html, 'text/html')
  /* 언어별 글꼴 + 계산서의 모든 글자가 축소 글꼴에 있는지 (없으면 PDF 에 빈 네모) */
  const htmlLang = (doc as any).documentElement.getAttribute('lang') ?? ''
  const font = resolve('public/fonts', reportFontFile(htmlLang))
  pdfMake.addFonts({ Report: { normal: font, bold: font, italics: font, bolditalics: font } })
  const face = (fontkit as any).openSync ? (fontkit as any).openSync(font) : (fontkit as any).default.openSync(font)
  const text = String((doc as any).documentElement.textContent ?? '') + Object.values(({ko:addKo,en:addEn,'zh-TW':addTW,'zh-CN':addCN})[lang]).join(' ')
  const missing = [...new Set([...text].filter((ch) => ch.codePointAt(0)! > 0x20 && !face.hasGlyphForCodePoint(ch.codePointAt(0)!)))]
  assert.deepEqual(missing, [], `${lang}: glyphs missing from ${font}`)
  assert.equal(reportFontFile(htmlLang), lang === 'zh-TW' ? 'report-tc.otf' : lang === 'zh-CN' ? 'report-sc.otf' : 'report-kr.otf', `${lang} (${htmlLang}) font`)
  const def = reportPdfDefinition(doc as unknown as Document, (el) => new XMLSerializer().serializeToString(el as any))
  const buffer = await pdfMake.createPdf(def).getBuffer()
  const pdf = await PDFDocument.load(buffer)
  assert.ok(pdf.getPageCount() >= (code==='ADDITIONS'?2:8))
  const path = `output/pdf/steel-report-${code}-${lang}.pdf`
  writeFileSync(path, buffer)
  console.log(JSON.stringify({ path, font: font.split(/[\\/]/).pop(), pages: pdf.getPageCount(), bytes: buffer.length }))
}
