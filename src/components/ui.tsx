import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

export function Card({ title, hint, right, children, wide }: { title: string; hint?: string; right?: ReactNode; children: ReactNode; wide?: boolean }) {
  return (
    <section className={'card' + (wide ? ' card-wide' : '')}>
      <header className="card-head">
        <div>
          <h3>{title}</h3>
          {hint && <p className="muted small">{hint}</p>}
        </div>
        {right}
      </header>
      {children}
    </section>
  )
}

type KpiProps = {
  label: string
  // Готовый текст — или число amount + format. Цифры меняются «барабаном», как на счётчике.
  value?: string
  amount?: number
  format?: (n: number) => string
  // Минимальная прибавка, ради которой панель вспыхивает своим цветом (например, 0,005 $ или 1 показ).
  rise?: number
  // Что сейчас показано (период, игра, платформа): при смене — это не «прибавка», а другие данные.
  scope?: string
  hint?: string
  accent?: string
  icon?: ReactNode
  big?: boolean
}

export function Kpi({ label, value, amount, format, rise, scope, hint, accent, icon, big }: KpiProps) {
  const grew = useRise(rise != null ? amount : undefined, scope, rise ?? 0)
  return (
    <div className={'kpi' + (big ? ' kpi-big' : '') + (grew ? ' kpi-rising' : '')} style={accent ? ({ '--accent': accent } as React.CSSProperties) : undefined}>
      {grew && <span key={grew.id} className="kpi-glow" />}
      <div className="kpi-label">
        {icon}
        <span>{label}</span>
      </div>
      <div className="kpi-value">
        <Rolling text={amount != null && Number.isFinite(amount) && format ? format(amount) : (value ?? '')} />
        {grew && format && (
          <span key={grew.id} className="kpi-delta">
            +{format(grew.by)}
          </span>
        )}
      </div>
      {hint && <div className="kpi-hint">{hint}</div>}
    </div>
  )
}

// Число-счётчик: каждая цифра — барабан 0–9, который прокручивается к новой цифре (вверх или вниз).
// Разряды выровнены справа, поэтому при 9,99 → 10,00 единицы остаются на своём месте.
export function Rolling({ text }: { text: string }) {
  const chars = [...text]
  return (
    <span className="rolling" aria-label={text}>
      {chars.map((ch, i) => {
        const fromRight = chars.length - i
        const d = ch >= '0' && ch <= '9' ? Number(ch) : -1
        if (d < 0)
          return (
            <span key={'c' + fromRight} className="rolling-char" aria-hidden>
              {ch}
            </span>
          )
        return (
          <span key={'d' + fromRight} className="rolling-digit" aria-hidden>
            <span className="rolling-strip" style={{ transform: `translateY(${-d * 10}%)`, transitionDelay: `${(fromRight % 6) * 35}ms` }}>
              {DIGITS.map((n) => (
                <span key={n}>{n}</span>
              ))}
            </span>
          </span>
        )
      })}
    </span>
  )
}

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]

// Число выросло внутри тех же данных (то же scope) хотя бы на step — повод подсветить панель.
function useRise(amount: number | undefined, scope: string | undefined, step: number) {
  const prev = useRef({ amount, scope })
  const [grew, setGrew] = useState<{ by: number; id: number } | null>(null)
  useEffect(() => {
    const before = prev.current
    prev.current = { amount, scope }
    if (amount == null || before.amount == null || before.scope !== scope) return
    if (amount - before.amount >= step && step > 0) setGrew({ by: amount - before.amount, id: Date.now() })
  }, [amount, scope, step])
  useEffect(() => {
    if (!grew) return
    const t = window.setTimeout(() => setGrew(null), 2600)
    return () => window.clearTimeout(t)
  }, [grew])
  return grew
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>
}

export function SectionTitle({ icon, title, hint }: { icon: ReactNode; title: string; hint?: string }) {
  return (
    <div className="section-title">
      <div className="section-icon">{icon}</div>
      <div>
        <h2>{title}</h2>
        {hint && <p className="muted">{hint}</p>}
      </div>
    </div>
  )
}

export function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const w = max > 0 ? Math.max(2, (value / max) * 100) : 0
  return (
    <div className="hbar">
      <div className="hbar-fill" style={{ width: w + '%', background: color }} />
    </div>
  )
}

// Подписи осей и подсказки графиков — в тон тёмной теме.
export const axis = { stroke: '#5b668c', fontSize: 12, tickLine: false, axisLine: false } as const
export const grid = { stroke: '#232d52', strokeDasharray: '3 3', vertical: false } as const
export const tooltipStyle = {
  contentStyle: { background: '#141c3a', border: '1px solid #2b3766', borderRadius: 12, color: '#e8edff', boxShadow: '0 12px 30px rgba(0,0,0,.35)' },
  labelStyle: { color: '#aab6e0', marginBottom: 6 },
  itemStyle: { padding: '2px 0' },
  cursor: { fill: 'rgba(120,140,220,.08)' },
} as const

// Иконка игры из магазина; пока её нет (или не нашлась) — кружок с первыми буквами названия своего цвета.
export function AppIcon({ name, src, size = 32 }: { name: string; src?: string | null; size?: number }) {
  const [broken, setBroken] = useState(false)
  const style = { width: size, height: size, borderRadius: Math.round(size * 0.24) }
  if (src && !broken) return <img className="app-icon" src={src} alt="" style={style} loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} />
  const letters = name
    .replace(/[^\p{L}\p{N} ]/gu, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('')
  let hash = 0
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return (
    <span className="app-icon app-icon-letters" style={{ ...style, fontSize: size * 0.38, background: `hsl(${hash % 360} 55% 42%)` }} aria-hidden>
      {letters || '?'}
    </span>
  )
}
