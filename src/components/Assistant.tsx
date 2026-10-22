import { useState } from 'react'
import { CheckCircle2, ChevronDown, Info, OctagonAlert, Sparkles, TrendingUp, TriangleAlert } from 'lucide-react'
import type { Alert, AlertLevel } from '../types'

const LEVELS: Record<AlertLevel, { icon: typeof Info; label: string }> = {
  error: { icon: OctagonAlert, label: 'сломалось' },
  warn: { icon: TriangleAlert, label: 'подозрительно' },
  info: { icon: Info, label: 'к сведению' },
  good: { icon: TrendingUp, label: 'хорошие новости' },
}

const VISIBLE = 5

// Помощник: что сломалось или выглядит подозрительно — и что с этим делать.
// Каждое сообщение — одна строка; подробности раскрываются по клику, метки сверху фильтруют.
export function Assistant({ alerts, onOpenApp }: { alerts: Alert[]; onOpenApp?: (app: string) => void }) {
  const [filter, setFilter] = useState<AlertLevel | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)

  if (!alerts.length)
    return (
      <section className="card card-wide assistant assistant-calm">
        <CheckCircle2 size={20} />
        <div>
          <h3>Помощник: всё спокойно</h3>
          <p className="muted small">Резких падений, пустых блоков и блокировок не видно.</p>
        </div>
      </section>
    )

  const counts = (Object.keys(LEVELS) as AlertLevel[]).map((l) => ({ level: l, n: alerts.filter((a) => a.level === l).length })).filter((c) => c.n > 0)
  const list = filter ? alerts.filter((a) => a.level === filter) : alerts
  const shown = expanded ? list : list.slice(0, VISIBLE)

  return (
    <section className="card card-wide assistant">
      <header className="assistant-head">
        <h3 className="with-icon">
          <Sparkles size={17} /> Помощник
        </h3>
        <div className="pills">
          {counts.map((c) => (
            <button
              key={c.level}
              className={'pill pill-' + c.level + (filter === c.level ? ' pill-on' : '') + (filter && filter !== c.level ? ' pill-dim' : '')}
              onClick={() => {
                setFilter(filter === c.level ? null : c.level)
                setExpanded(false)
              }}
              title={filter === c.level ? 'Показать все' : 'Показать только эти'}
            >
              {c.n} {LEVELS[c.level].label}
            </button>
          ))}
        </div>
      </header>

      <ul className="alerts">
        {shown.map((a) => {
          const Icon = LEVELS[a.level].icon
          const open = openId === a.id
          return (
            <li key={a.id} className={'alert alert-' + a.level + (open ? ' open' : '')}>
              <button className="alert-row" onClick={() => setOpenId(open ? null : a.id)} aria-expanded={open}>
                <Icon size={16} className="alert-icon" />
                <span className="alert-title">{a.title}</span>
                <ChevronDown size={16} className="alert-chevron" />
              </button>
              {open && (
                <div className="alert-body">
                  <p>{a.text}</p>
                  {a.detail && <p className="muted small">{a.detail}</p>}
                  {onOpenApp && a.app && (
                    <button className="link small" onClick={() => onOpenApp(a.app!)}>
                      Открыть {a.app} →
                    </button>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>

      {list.length > VISIBLE && (
        <button className="link more" onClick={() => setExpanded(!expanded)}>
          {expanded ? 'Свернуть' : `Ещё ${list.length - VISIBLE}`}
        </button>
      )}
    </section>
  )
}
