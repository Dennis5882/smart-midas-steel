import { useEffect, useId, useRef, type ReactNode } from 'react'
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Building2, Send } from 'lucide-react'
import { baySpans, frameSpans, type FactorySpec } from '../domain/types'
import { t } from '../i18n'

export const WIZARD_STEPS = ['mw_scope', 'mw_frame', 'mw_bays', 'mw_sections', 'mw_loads', 'mw_review'] as const
const HINTS = ['mw_scope_hint', 'mw_frame_hint', 'mw_bays_hint', 'mw_sections_hint', 'mw_loads_hint', 'mw_review_hint'] as const

/** Small explanatory elevation/plan, independent of the interactive 3D viewport. */
function GeometrySketch({ spec, plan }: { spec: FactorySpec; plan: boolean }) {
  const gridId = useId()
  const spans = baySpans(spec)
  const length = spans.reduce((a, b) => a + b, 0)
  const mono = spec.frame === 'mono'
  const widths = frameSpans(spec)
  const rise = (mono ? spec.span : Math.max(...widths) / 2) * spec.roofSlope
  const width = 220, scale = Math.min(width / spec.span, 112 / (spec.eaveHeight + rise))
  const left = (300 - spec.span * scale) / 2, right = 300 - left
  const eave = 145 - spec.eaveHeight * scale, ridge = eave - rise * scale
  const n = Math.min(spec.bays, 16)
  return <div className="mw-sketch" aria-hidden="true">
    <svg viewBox="0 0 300 185" focusable="false">
      <defs><pattern id={gridId} width="15" height="15" patternUnits="userSpaceOnUse"><path d="M 15 0 L 0 0 0 15" fill="none" stroke="var(--border)" strokeWidth=".5" /></pattern></defs>
      <rect x="0" y="0" width="300" height="185" fill={`url(#${gridId})`} />
      {plan ? <>
        <path d="M40 38 H260 V139 H40 Z" fill="var(--tile)" stroke="var(--cyan)" strokeWidth="2" />
        {Array.from({ length: n + 1 }, (_, i) => <path key={i} d={`M${40 + i * 220 / n} 38 V139`} stroke="var(--blue)" strokeWidth="1.5" />)}
        <path d="M40 88 H260" stroke="var(--muted)" strokeDasharray="4 4" />
        <text x="150" y="163" textAnchor="middle">{+length.toFixed(2)} m · {spec.bays} × {spec.baySpacing} m</text>
        <text x="150" y="24" textAnchor="middle">{t('mw_plan')}</text>
      </> : <>
        <path d={mono ? `M${left} 145 V${eave} L${right} ${ridge} V145`
          : `M${left} 145 V${eave} ${widths.reduce((acc, w, i) => { const x0 = left + widths.slice(0, i).reduce((a, b) => a + b, 0) * scale; return `${acc} L${x0 + w * scale / 2} ${eave - (w / 2) * spec.roofSlope * scale} L${x0 + w * scale} ${eave}` }, '')} V145`}
          fill="var(--tile)" stroke="var(--cyan)" strokeWidth="4" strokeLinejoin="round" />
        {/* 다경간 내부 기둥 (흔들림 기둥) */}
        {widths.slice(0, -1).map((_, i) => { const x = left + widths.slice(0, i + 1).reduce((a, b) => a + b, 0) * scale; return <path key={i} d={`M${x} 145 V${eave}`} stroke="var(--cyan)" strokeWidth="2" strokeDasharray="4 3" /> })}
        <path d={`M${left - 12} 149 H${left + 12} M${right - 12} 149 H${right + 12}`} stroke="var(--muted)" strokeWidth="2" />
        <path d={`M${left} 163 H${right} M${left} 158 V168 M${right} 158 V168`} stroke="var(--muted)" />
        <text x="150" y="180" textAnchor="middle">{spec.span} m</text>
        {/* 편경사: 낮은 처마는 왼쪽, 높은 처마는 오른쪽에 */}
        <text x={mono ? left - 8 : right + 8} y={(145 + eave) / 2} fontSize="10" textAnchor={mono ? 'end' : 'start'}>{spec.eaveHeight} m</text>
        {mono && <text x={right + 8} y={(145 + ridge) / 2} fontSize="10">{+(spec.eaveHeight + rise).toFixed(2)} m</text>}
        <text x="150" y={Math.max(14, ridge - 12)} textAnchor="middle">{t('f_slope')} {spec.roofSlope}</text>
      </>}
    </svg>
  </div>
}

interface Props {
  spec: FactorySpec; step: number; visited: number; disabled: boolean; blocked: boolean; invalid: boolean; attempted: boolean
  onStep(step: number): void; onBuild(): void; onCancel(): void; children: ReactNode
}

export function ModelWizard({ spec, step, visited, disabled, blocked, invalid, attempted, onStep, onBuild, onCancel, children }: Props) {
  const heading = useRef<HTMLHeadingElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const mounted = useRef(false)
  useEffect(() => {
    if (content.current) content.current.scrollTop = 0
    if (mounted.current) heading.current?.focus({ preventScroll: true })
    mounted.current = true
  }, [step])
  const length = baySpans(spec).reduce((a, b) => a + b, 0)
  return <div className="model-wizard">
    <header className="mw-banner">
      <div className="mw-brand"><Building2 size={18} /><span>{t('mw_title')}</span><span className="mw-code">{spec.code}</span></div>
      <div className="mw-progress-text"><span>{t('mw_process')}</span><strong>{String(step + 1).padStart(2, '0')} / 06</strong></div>
      <div className="mw-progress" role="progressbar" aria-label={t('mw_process')} aria-valuemin={1} aria-valuemax={6} aria-valuenow={step + 1}><span style={{ width: `${(step + 1) / 6 * 100}%` }} /></div>
    </header>
    <nav className="mw-steps" aria-label={t('mw_process')}>{WIZARD_STEPS.map((key, i) => <button key={key} type="button" disabled={disabled || i > visited}
      aria-current={i === step ? 'step' : undefined} onClick={() => onStep(i)} title={t(key)}>
      <span className={`mw-step-dot${i === step ? ' current' : i < visited ? ' done' : ''}`}>{i < visited && i !== step ? <Check size={12} /> : i + 1}</span><span>{t(key)}</span>
    </button>)}</nav>
    <div className="mw-content" ref={content}>
      <div className="mw-stage-heading"><span className="mw-eyebrow">{t('mw_step', step + 1)}</span><h3 tabIndex={-1} ref={heading}>{t(WIZARD_STEPS[step])}</h3><p>{t(HINTS[step])}</p></div>
      {(step === 1 || step === 2) && <GeometrySketch spec={spec} plan={step === 2} />}
      {step > 1 && <div className="mw-metrics"><span>{t('f_span')}<b>{spec.span}<small> m</small></b></span><span>{t('kv_length')}<b>{+length.toFixed(2)}<small> m</small></b></span><span>{t('f_eave')}<b>{spec.eaveHeight}<small> m</small></b></span></div>}
      {step === 5 && !blocked && !invalid && <div className="mw-ready"><CheckCircle2 size={18} />{t('mw_ready')}</div>}
      {children}
      {attempted && (blocked || invalid) && <p className="mw-error mw-alert" role="alert">{t(blocked ? 'sc_blocked' : 'mw_invalid')}</p>}
    </div>
    <footer className="mw-footer">
      <div className="mw-footer-actions">
        <button className="btn btn-ghost" disabled={disabled} onClick={step ? () => onStep(step - 1) : onCancel}>{step ? <ArrowLeft size={14} /> : null}{t(step ? 'mw_back' : 'ws_home')}</button>
        {step < 5 ? <button className="btn btn-c" disabled={disabled} onClick={() => onStep(step + 1)}>{t(step === 4 ? 'mw_to_review' : 'mw_next')}<ArrowRight size={14} /></button>
          : <button className="btn btn-c" disabled={disabled || blocked || invalid} onClick={onBuild}><Send size={14} />{t('mw_build')}</button>}
      </div>
      <p>{t(disabled ? 'mw_locked' : 'mw_preview_note')}</p>
    </footer>
  </div>
}
