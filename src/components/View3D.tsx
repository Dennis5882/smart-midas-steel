/* 3D VIEW — Plotly 는 동적 import 로 첫 화면 번들에서 분리 (story View3D 와 같은 방식).
   S.preview(편집 중 스펙)가 있으면 그 형상, 없으면 Gen 에 보낸 모델. S.viewNonce 변경 시 재플롯. */
import { useEffect, useMemo, useRef } from 'react'
import { buildPortal } from '../domain/portal'
import { ROLES, type ElementRole, type FactoryModel } from '../domain/types'
import { t, useLang } from '../i18n'
import { S, notify, useStore, type CamId } from '../state/store'

type Plotly = typeof import('plotly.js-dist-min')
let plotlyP: Promise<Plotly> | null = null
const loadPlotly = () => (plotlyP ??= import('plotly.js-dist-min').then((m) => ((m as any).default ?? m) as Plotly))

const ROLE_VAR: Record<ElementRole, [string, string, number]> = {
  column: ['--p-col', '#4cc2ff', 5], rafter: ['--p-raf', '#5ee6a8', 5],
  purlin: ['--p-pur', '#9b8cff', 2], girt: ['--p-girt', '#ffb454', 2], strut: ['--p-strut', '#ff6b6b', 3],
  post: ['--p-post', '#4cc2ff', 3], brace: ['--p-brace', '#ff6bd5', 2],
}

/* 3D 색 = 현재 테마의 CSS 변수(app.css --p-*) — 플롯할 때마다 읽어 테마 전환에 따라감 */
function palette() {
  const cs = getComputedStyle(document.documentElement)
  const v = (n: string, fb: string) => cs.getPropertyValue(n).trim() || fb
  return {
    role: Object.fromEntries(ROLES.map((r) => [r, v(ROLE_VAR[r][0], ROLE_VAR[r][1])])) as Record<ElementRole, string>,
    sup: v('--p-sup', '#ff6b6b'), supBd: v('--p-sup-bd', '#ff9999'),
    axis: v('--p-axis', '#445069'), grid: v('--p-grid', '#1a2538'), scene: v('--p-scene', 'rgba(10,14,26,0.4)'),
    legend: v('--p-legend', 'rgba(0,0,0,0.85)'), legendBd: v('--p-legend-bd', 'rgba(31,42,61,0.5)'), txt: v('--p-txt', '#c9d4e8'),
  }
}

const CAMS: Record<CamId, { eye: { x: number; y: number; z: number }; up?: { x: number; y: number; z: number } }> = {
  iso: { eye: { x: 1.5, y: -1.7, z: 1.0 } },
  front: { eye: { x: 0, y: -2.5, z: 0 } },  // 프레임 면(X–Z)
  side: { eye: { x: 2.5, y: 0, z: 0 } },    // 길이 방향(Y–Z)
  top: { eye: { x: 0, y: 0, z: 2.5 }, up: { x: 0, y: 1, z: 0 } },
}
const FONT = 'IBM Plex Mono, Noto Sans KR, Noto Sans TC, Noto Sans SC'

/** 강도비 색상 구간 — 상한, 색 토큰, 대체색 */
const BANDS: [number, string, string][] = [[0.5, '--blue', '#4cc2ff'], [0.7, '--green', '#5ee6a8'], [0.9, '--cyan', '#38e1d6'], [1.0, '--amber', '#ffb454'], [Infinity, '--red', '#ff6b6b']]

function ratioTraces(m: FactoryModel, ratio: Map<number, number>) {
  const cs = getComputedStyle(document.documentElement)
  const byId = new Map(m.nodes.map((n) => [n.id, n]))
  return BANDS.map(([hi, v, fb], i) => {
    const lo = i ? BANDS[i - 1][0] : -Infinity
    const x: (number | null)[] = [], y: (number | null)[] = [], z: (number | null)[] = []
    for (const e of m.elements) {
      const r = ratio.get(e.id) ?? 0
      if (r <= lo || r > hi) continue
      const a = byId.get(e.n1)!, b = byId.get(e.n2)!
      x.push(a.x, b.x, null); y.push(a.y, b.y, null); z.push(a.z, b.z, null)
    }
    const name = hi === Infinity ? `> ${lo.toFixed(1)}` : `${lo === -Infinity ? '0' : lo.toFixed(1)} – ${hi.toFixed(1)}`
    return { type: 'scatter3d', mode: 'lines', name, x, y, z, line: { color: cs.getPropertyValue(v).trim() || fb, width: 4 }, hoverinfo: 'skip' }
  }).filter((tr) => tr.x.length)
}

function traces(m: FactoryModel, P: ReturnType<typeof palette>, ratio: Map<number, number> | null) {
  const byId = new Map(m.nodes.map((n) => [n.id, n]))
  const out: any[] = ratio ? ratioTraces(m, ratio) : []
  for (const r of ratio ? [] : ROLES) {
    const x: (number | null)[] = [], y: (number | null)[] = [], z: (number | null)[] = []
    for (const e of m.elements) {
      if (e.role !== r) continue
      const a = byId.get(e.n1)!, b = byId.get(e.n2)!
      x.push(a.x, b.x, null); y.push(a.y, b.y, null); z.push(a.z, b.z, null)
    }
    if (x.length) out.push({ type: 'scatter3d', mode: 'lines', name: t(`role_${r}`), x, y, z,
      line: { color: P.role[r], width: ROLE_VAR[r][2] }, hoverinfo: 'skip' })
  }
  const sup = m.nodes.filter((n) => n.z === 0)
  out.push({ type: 'scatter3d', mode: 'markers', name: t('support'),
    x: sup.map((n) => n.x), y: sup.map((n) => n.y), z: sup.map((n) => n.z),
    text: sup.map((n) => `N${n.id}  (${n.x}, ${n.y}, 0) m`), hovertemplate: '%{text}<extra></extra>',
    marker: { size: 4, color: P.sup, symbol: 'diamond', line: { color: P.supBd, width: 1 } } })
  return out
}

function axis(title: string, P: ReturnType<typeof palette>) {
  return {
    title: { text: title, font: { color: P.axis, size: 12, family: FONT } },
    color: P.axis, gridcolor: P.grid, zerolinecolor: P.grid, backgroundcolor: P.scene, showbackground: true,
    tickfont: { color: P.axis, size: 10, family: FONT },
  }
}

export function View3D() {
  const s = useStore()
  const lang = useLang()
  const ref = useRef<HTMLDivElement>(null)
  const model = useMemo(() => (s.preview ? buildPortal(s.preview) : s.built?.model ?? null), [s.viewNonce, s.built])
  /* 강도비 색상 — 설계 검토 결과가 있고 미리보기가 아닐 때만 */
  const ratio = useMemo(() => (s.ratioView && !s.preview && s.design ? new Map(s.design.members.map((m) => [m.id, m.ratio])) : null), [s.ratioView, s.preview, s.design])

  useEffect(() => {
    const el = ref.current
    if (!el || !model) return
    let alive = true
    void loadPlotly().then((Plotly) => {
      if (!alive) return
      const P = palette()
      const cam = CAMS[S.cam]
      void Plotly.react(el, traces(model, P, ratio), {
        paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)', margin: { l: 0, r: 0, t: 0, b: 0 },
        font: { family: FONT, color: P.txt },
        legend: { bgcolor: P.legend, bordercolor: P.legendBd, borderwidth: 1, font: { size: 11, color: P.txt }, x: 0.01, y: 0.99 },
        scene: {
          aspectmode: 'data',
          xaxis: axis('X (m)', P), yaxis: axis('Y (m)', P), zaxis: axis('Z (m)', P),
          camera: { eye: cam.eye, up: cam.up ?? { x: 0, y: 0, z: 1 }, projection: { type: S.cam === 'iso' ? 'perspective' : 'orthographic' } },
        },
      } as any, { responsive: true, displaylogo: false })
    })
    return () => { alive = false }
  }, [model, ratio, s.cam, s.theme, lang])

  const setCam = (c: CamId) => { S.cam = c; notify() }
  const len = model ? Math.max(...model.nodes.map((n) => n.y)) : 0
  const span = model ? Math.max(...model.nodes.map((n) => n.x)) : 0

  return (
    <>
      <div className="view-tb">
        <span className="vlbl">{t('view_cam')}</span>
        {(['iso', 'front', 'side', 'top'] as const).map((c) => (
          <button key={c} className={`vcam${s.cam === c ? ' on' : ''}`} onClick={() => setCam(c)}>{t(`cam_${c}`)}</button>
        ))}
        {s.design && !s.preview && <>
          <span className="vsep" />
          <button className={`vcam${!s.ratioView ? ' on' : ''}`} onClick={() => { S.ratioView = false; notify() }}>{t('view_role')}</button>
          <button className={`vcam${s.ratioView ? ' on' : ''}`} onClick={() => { S.ratioView = true; notify() }}>{t('view_ratio')}</button>
        </>}
        {s.preview && <><span className="vsep" /><span className="vlbl" style={{ color: 'var(--amber)' }}>{t('preview_tag')}</span></>}
      </div>
      {model
        ? <div id="plot" ref={ref} />
        : <div className="res-empty" style={{ flex: 1 }}>{t('view_empty')}</div>}
      {model && (
        <div className="view-stats">
          <span className="vs-item">{t('st_node')} <span className="vs-val">{model.nodes.length}</span></span>
          <span className="vs-item">{t('st_elem')} <span className="vs-val">{model.elements.length}</span></span>
          <span className="vs-item">{t('kv_span')} <span className="vs-val vs-hi">{span} m</span></span>
          <span className="vs-item">{t('kv_length')} <span className="vs-val">{len} m</span></span>
        </div>
      )}
    </>
  )
}
