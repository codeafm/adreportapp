import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ChevronDown, Crown, Gem, TriangleAlert } from 'lucide-react'
import type { GeoRow } from '../types'
import { count, cpm, pct, ratio, sum, usd, usdPrecise } from '../format'
import { Bar, Card } from './ui'
import { MAP_GRADIENT, rankColors, WorldMap } from './WorldMap'
import type { MapCountry } from './WorldMap'

type Country = { key: string; name: string; code: string | null; revenue: number; impressions: number; requests: number; ecpm: number; fill: number }
type SortKey = 'revenue' | 'ecpm' | 'impressions' | 'requests' | 'fill'
type Metric = 'ecpm' | 'revenue' | 'impressions' | 'fill'

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'revenue', label: 'Доход' },
  { key: 'ecpm', label: 'eCPM' },
  { key: 'impressions', label: 'Показы' },
  { key: 'requests', label: 'Запросы' },
  { key: 'fill', label: 'Заполнение' },
]

// Цена 1000 показов честна от 100 показов: на десятке одна реклама за 5 $ делает страну «самой дорогой».
const MIN_IMPRESSIONS = 100

// Чем красить карту. eCPM честен только при заметном числе показов — иначе одна реклама за 5 $ делает страну «самой дорогой».
const METRICS: Record<Metric, { label: string; low: string; high: string; value: (c: Country) => number | null; format: (n: number) => string }> = {
  ecpm: { label: 'eCPM', low: 'дешевле', high: 'дороже', value: (c) => (c.impressions >= MIN_IMPRESSIONS ? c.ecpm : null), format: usdPrecise },
  revenue: { label: 'Доход', low: 'меньше', high: 'больше', value: (c) => (c.revenue > 0 ? c.revenue : null), format: usd },
  impressions: { label: 'Показы', low: 'меньше', high: 'больше', value: (c) => (c.impressions > 0 ? c.impressions : null), format: count },
  fill: { label: 'Заполнение', low: 'пусто', high: 'полно', value: (c) => (c.requests >= 50 ? c.fill : null), format: pct },
}

// Страны: карта, где больше платят, и полный список. Яндекс и Unity, весь выбранный период.
export function CountriesTable({ rows }: { rows: GeoRow[] }) {
  const [metric, setMetric] = useState<Metric>('ecpm')
  const [sortBy, setSortBy] = useState<SortKey>('revenue')
  const [listOpen, setListOpen] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [highlight, setHighlight] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const countries = useMemo(() => {
    const map = new Map<string, Country>()
    for (const r of rows) {
      const key = r.code ?? r.country
      const c = map.get(key) ?? { key, name: r.country, code: r.code, revenue: 0, impressions: 0, requests: 0, ecpm: 0, fill: 0 }
      c.revenue += r.revenue
      c.impressions += r.impressions
      c.requests += r.requests
      map.set(key, c)
    }
    return [...map.values()]
      .map((c) => ({ ...c, ecpm: cpm(c.revenue, c.impressions), fill: ratio(c.impressions, c.requests) || 0 }))
      .filter((c) => c.requests > 0 || c.impressions > 0 || c.revenue > 0)
  }, [rows])

  const m = METRICS[metric]
  const mapCountries = useMemo<MapCountry[]>(
    () =>
      countries
        .filter((c) => c.code)
        .map((c) => ({
          code: c.code!,
          name: c.name,
          value: m.value(c),
          lines: [
            `eCPM ${c.impressions ? usdPrecise(c.ecpm) : '—'} · доход ${usd(c.revenue)}`,
            `${count(c.impressions)} показов из ${count(c.requests)} запросов · заполнение ${c.requests ? pct(c.fill) : '—'}`,
          ],
        })),
    [countries, m],
  )

  const colors = useMemo(() => rankColors(mapCountries), [mapCountries])

  // Клик по стране на карте — открыть список и показать её строку.
  useEffect(() => {
    if (!selected || !listOpen) return
    listRef.current?.querySelector(`[data-code="${selected}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [selected, listOpen, sortBy])

  if (!countries.length) return null

  const total = sum(countries, (c) => c.revenue)
  const sorted = [...countries].sort((a, b) => b[sortBy] - a[sortBy] || b.revenue - a.revenue)
  const top = Math.max(0, ...countries.map((c) => c.revenue))
  const ranked = mapCountries.filter((c) => c.value != null).sort((a, b) => b.value! - a.value!)
  const lo = ranked.length ? ranked[ranked.length - 1].value! : 0
  const hi = ranked.length ? ranked[0].value! : 0

  // Подсказки. «Не определено» не в счёт — с ним ничего не сделать. Цену сравниваем от 100 показов,
  // заполнение — от 1000 запросов: на мелочи одна случайная реклама за 5 $ всё перекосит.
  const known = countries.filter((c) => c.code || c.name !== 'Не определено')
  // Топ-5 — из всех стран, и тех, что не нарисованы на карте (Абхазия): у них серая точка.
  const leaders = known
    .map((c) => ({ ...c, value: m.value(c) }))
    .filter((c) => c.value != null)
    .sort((a, b) => b.value! - a.value!)
    .slice(0, 5)
  const richest = [...known].sort((a, b) => b.revenue - a.revenue)[0]
  const priciest = known.filter((c) => c.impressions >= MIN_IMPRESSIONS).sort((a, b) => b.ecpm - a.ecpm)[0]
  const emptiest = known.filter((c) => c.requests >= 1000).sort((a, b) => a.fill - b.fill)[0]

  const select = (code: string) => {
    setSelected(code)
    setListOpen(true)
  }

  return (
    <Card
      title="Страны"
      hint="Где больше платят — Яндекс и Unity. Наведите на страну, нажмите — строка в списке"
      wide
      right={
        <div className="seg seg-small">
          {(Object.keys(METRICS) as Metric[]).map((k) => (
            <button key={k} className={k === metric ? 'on' : ''} onClick={() => setMetric(k)}>
              {METRICS[k].label}
            </button>
          ))}
        </div>
      }
    >
      <div className="geo-layout">
        <div>
          <WorldMap countries={mapCountries} colors={colors} selected={selected} highlight={highlight} marker={leaders.find((c) => c.code)?.code ?? null} onSelect={select} />
          <div className="map-legend">
            <span className="muted small">{m.low}</span>
            <span className="map-legend-bar" style={{ background: MAP_GRADIENT }} />
            <span className="muted small">{m.high}</span>
            {ranked.length > 0 && (
              <span className="muted small map-legend-range">
                {m.format(lo)} … {m.format(hi)}
              </span>
            )}
            <span className="map-legend-chip">
              <i style={{ background: 'var(--map-thin)' }} /> {metric === 'ecpm' ? 'мало показов' : 'мало данных'}
            </span>
          </div>
        </div>

        <aside className="geo-side">
          <div className="geo-side-title">Топ-5 · {m.label}</div>
          <ol className="geo-top">
            {leaders.map((c, i) => (
              <li key={c.key} onMouseEnter={() => setHighlight(c.code)} onMouseLeave={() => setHighlight(null)} onClick={() => c.code && select(c.code)}>
                <span className="geo-rank">{i + 1}</span>
                <span className="dot" style={{ background: (c.code && colors.get(c.code)) || 'var(--map-thin)' }} />
                <span className="geo-name">{c.name}</span>
                <b>{m.format(c.value!)}</b>
              </li>
            ))}
          </ol>

          <div className="geo-notes">
            {richest && (
              <button style={{ '--accent': '#3fd6a4' } as React.CSSProperties} onClick={() => richest.code && select(richest.code)} title="Больше всего дохода">
                <Crown size={14} /> <b>{richest.name}</b> — {pct(ratio(richest.revenue, total))} дохода
              </button>
            )}
            {priciest && (
              <button style={{ '--accent': '#ffcc33' } as React.CSSProperties} onClick={() => priciest.code && select(priciest.code)} title="Дороже всего показ (от 100 показов)">
                <Gem size={14} /> <b>{priciest.name}</b> — {usdPrecise(priciest.ecpm)} за 1000
              </button>
            )}
            {emptiest && emptiest.fill < 0.5 && (
              <button
                style={{ '--accent': '#ff5c7a' } as React.CSSProperties}
                onClick={() => emptiest.code && select(emptiest.code)}
                title="Больше всего пустых запросов (от 1000 запросов)"
              >
                <TriangleAlert size={14} /> <b>{emptiest.name}</b> — показ у {pct(emptiest.fill)}
              </button>
            )}
          </div>
        </aside>
      </div>

      <button className={'list-toggle' + (listOpen ? ' open' : '')} onClick={() => setListOpen(!listOpen)}>
        <ChevronDown size={16} /> {listOpen ? 'Скрыть список' : `Полный список стран (${countries.length})`}
      </button>

      {listOpen && (
        <div className="table-wrap geo-list" ref={listRef}>
          <table className="geo-table">
            <thead>
              <tr>
                <th>Страна</th>
                {COLUMNS.map((c) => (
                  <th key={c.key} className={'num sortable' + (sortBy === c.key ? ' sorted' : '')} onClick={() => setSortBy(c.key)} title="Сортировать">
                    {c.label}
                    {sortBy === c.key && <ArrowDown size={12} />}
                  </th>
                ))}
                <th className="share-head">Доля дохода</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((c) => (
                <tr
                  key={c.key}
                  data-code={c.code ?? ''}
                  className={'clickable' + (c.code && c.code === selected ? ' selected-row' : '')}
                  onClick={() => c.code && setSelected(c.code)}
                >
                  <td>
                    <span className="cc">{c.code ?? '—'}</span> {c.name}
                  </td>
                  <td className="num strong">{usd(c.revenue)}</td>
                  <td className="num">{c.impressions ? usdPrecise(c.ecpm) : '—'}</td>
                  <td className="num">{count(c.impressions)}</td>
                  <td className="num">{c.requests ? count(c.requests) : '—'}</td>
                  <td className="num">{c.requests ? pct(c.fill) : '—'}</td>
                  <td className="share-cell">
                    <Bar value={c.revenue} max={top} color="#3fd6a4" />
                    <span className="muted small">{pct(ratio(c.revenue, total))}</span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className="strong">Итого · {countries.length} стран</td>
                <td className="num strong">{usd(total)}</td>
                <td className="num">
                  {usdPrecise(
                    cpm(
                      total,
                      sum(countries, (c) => c.impressions),
                    ),
                  )}
                </td>
                <td className="num strong">{count(sum(countries, (c) => c.impressions))}</td>
                <td className="num strong">{count(sum(countries, (c) => c.requests))}</td>
                <td className="num">
                  {pct(
                    ratio(
                      sum(countries, (c) => c.impressions),
                      sum(countries, (c) => c.requests),
                    ),
                  )}
                </td>
                <td className="muted small">100 %</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </Card>
  )
}
