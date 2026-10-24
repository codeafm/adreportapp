import { useMemo } from 'react'
import { Bar as RBar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { BadgeDollarSign, Eye, Gauge, Percent, TrendingUp, Wallet } from 'lucide-react'
import type { AdRow, Dashboard, Format, Network } from '../types'
import { FORMATS, NETWORKS } from '../types'
import { count, cpm, daysBetween, monthName, pct, ratio, shortDate, sum, todayIso, usd, usdPrecise } from '../format'
import { axis, Card, Empty, grid, Kpi, tooltipStyle } from './ui'

// Четыре главные цифры периода: сколько заработали, темп, вчера, цена показа.
// view — что выбрано (игра, платформа): вместе с периодом отличает «прибавку» от смены данных.
export function RevenueKpis({ data, rows, view = '' }: { data: Dashboard; rows: AdRow[]; view?: string }) {
  const { from, to } = data.range
  const scope = `${view}|${from}|${to}`
  // Деньги вспыхивают от полцента, показы — от одного.
  const money = { format: usd, rise: 0.005, scope }
  const dates = useMemo(() => daysBetween(from, to), [from, to])
  const revenue = sum(rows, (r) => r.revenue)
  const impressions = sum(rows, (r) => r.impressions)
  const requests = sum(rows, (r) => r.requests)
  const byDate = (d: string) =>
    sum(
      rows.filter((r) => r.date === d),
      (r) => r.revenue,
    )
  const activeDays = new Set(rows.filter((r) => r.revenue > 0).map((r) => r.date)).size || 1

  const endsToday = to === todayIso()

  // Один день («Сегодня», «Вчера»): среднее и «вчера» тут не к месту — показываем сам день.
  if (from === to)
    return (
      <div className="kpis">
        <Kpi
          icon={<Wallet size={16} />}
          label={endsToday ? 'Доход сегодня' : 'Доход за ' + shortDate(to)}
          amount={revenue}
          {...money}
          hint={endsToday ? 'день ещё идёт — сети досчитывают с задержкой' : 'за весь день'}
          accent="#3fd6a4"
          big
        />
        <Kpi icon={<Eye size={16} />} label="Показы" amount={impressions} format={count} rise={1} scope={scope} hint={`запросов ${count(requests)}`} accent="#a98bff" />
        <Kpi icon={<Percent size={16} />} label="Заполнение" value="—" amount={ratio(impressions, requests)} format={pct} hint="показы / запросы" accent="#ff5c7a" />
        <Kpi icon={<Gauge size={16} />} label="eCPM — цена 1000 показов" amount={cpm(revenue, impressions)} format={usdPrecise} accent="#ff9a3d" />
      </div>
    )

  // Календарный месяц: с 1-го числа и внутри одного месяца.
  const month = from.endsWith('-01') && from.slice(0, 7) === to.slice(0, 7) ? from.slice(0, 7) : null
  const monthDays = month ? new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate() : 30
  const perDay = revenue / activeDays
  const perDayHint = !month
    ? `за месяц выйдет ≈ ${usd(perDay * 30)}`
    : endsToday && data.range.days < monthDays
      ? `к концу месяца ≈ ${usd(perDay * monthDays)}`
      : `за ${data.range.days} дн.`
  const best = dates.reduce(
    (top, d) => {
      const v = byDate(d)
      return v > top.revenue ? { date: d, revenue: v } : top
    },
    { date: to, revenue: 0 },
  )

  return (
    <div className="kpis">
      <Kpi
        icon={<Wallet size={16} />}
        label={month ? 'Доход за месяц' : 'Доход за период'}
        amount={revenue}
        {...money}
        hint={month ? `${monthName(month)}, ${Number(from.slice(8))}–${Number(to.slice(8))} число` : `${data.range.days} дн.`}
        accent="#3fd6a4"
        big
      />
      <Kpi icon={<TrendingUp size={16} />} label="В среднем в день" amount={perDay} {...money} hint={perDayHint} accent="#ffcc33" />
      {endsToday ? (
        <Kpi
          icon={<BadgeDollarSign size={16} />}
          label="Вчера"
          amount={byDate(dates[dates.length - 2])}
          {...money}
          hint={`сегодня пока ${usd(byDate(to))}`}
          accent="#5cc8ff"
        />
      ) : (
        <Kpi icon={<BadgeDollarSign size={16} />} label="Лучший день" amount={best.revenue} {...money} hint={shortDate(best.date)} accent="#5cc8ff" />
      )}
      <Kpi
        icon={<Gauge size={16} />}
        label="eCPM — цена 1000 показов"
        amount={cpm(revenue, impressions)}
        format={usdPrecise}
        hint={`${count(impressions)} показов · заполнение ${pct(ratio(impressions, requests))}`}
        accent="#ff9a3d"
      />
    </div>
  )
}

// График по дням, форматы и сети.
export function RevenueCharts({ data, rows }: { data: Dashboard; rows: AdRow[] }) {
  const dates = useMemo(() => daysBetween(data.range.from, data.range.to), [data.range])
  const revenue = sum(rows, (r) => r.revenue)
  const nets = (Object.keys(NETWORKS) as Network[]).filter((n) => rows.some((r) => r.network === n))
  // На графике — только сети, которые что-то заработали; в списке сетей ниже видны все.
  const earning = nets.filter((n) => rows.some((r) => r.network === n && r.revenue > 0))

  const daily = useMemo(
    () =>
      dates.map((date) => {
        const day = rows.filter((r) => r.date === date)
        const point: Record<string, number | string> = {
          date,
          label: shortDate(date),
        }
        for (const n of Object.keys(NETWORKS) as Network[])
          point[n] = sum(
            day.filter((r) => r.network === n),
            (r) => r.revenue,
          )
        return point
      }),
    [dates, rows],
  )

  const formats = (Object.keys(FORMATS) as Format[])
    .map((f) => ({
      key: f,
      ...FORMATS[f],
      revenue: sum(
        rows.filter((r) => r.format === f),
        (r) => r.revenue,
      ),
    }))
    .filter((f) => f.revenue > 0)
  const networkTotals = nets.map((n) => ({
    key: n,
    ...NETWORKS[n],
    revenue: sum(
      rows.filter((r) => r.network === n),
      (r) => r.revenue,
    ),
  }))

  if (!rows.length) return <Empty>За этот период нет данных о рекламе.</Empty>

  return (
    <div className="grid">
      {dates.length > 1 && (
        <Card title="Доход по дням" hint="Сколько принесла каждая рекламная сеть" wide>
          <div className="chart">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={daily} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                <CartesianGrid {...grid} />
                {/* Шаг подписей считаем сами: автоподбор (minTickGap) на узком экране зацикливается. */}
                <XAxis dataKey="label" {...axis} interval={Math.max(0, Math.ceil(daily.length / 6) - 1)} />
                <YAxis {...axis} tickFormatter={(v) => '$' + v} />
                <Tooltip {...tooltipStyle} formatter={(v, name) => [usd(Number(v)), NETWORKS[name as Network]?.name ?? name]} />
                {earning.length > 1 && <Legend formatter={(v) => NETWORKS[v as Network]?.name ?? v} />}
                {earning.map((n, i) => (
                  <RBar key={n} dataKey={n} stackId="r" fill={NETWORKS[n].color} radius={i === earning.length - 1 ? [6, 6, 0, 0] : 0} isAnimationActive={false} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      <Card title="Форматы рекламы" hint="Какая реклама приносит деньги">
        <div className="split">
          <div className="donut">
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={formats} dataKey="revenue" nameKey="name" innerRadius={52} outerRadius={78} paddingAngle={3} stroke="none" isAnimationActive={false}>
                  {formats.map((f) => (
                    <Cell key={f.key} fill={f.color} />
                  ))}
                </Pie>
                <Tooltip {...tooltipStyle} formatter={(v) => usd(Number(v))} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="legend-list">
            {formats.map((f) => (
              <li key={f.key}>
                <span className="dot" style={{ background: f.color }} />
                <span>{f.name}</span>
                <b>{usd(f.revenue)}</b>
                <span className="muted">{pct(ratio(f.revenue, revenue))}</span>
              </li>
            ))}
            <li className="total">
                <span />
                <span>Итого</span>
                <b>{usd(revenue)}</b>
                <span className="muted">100 %</span>
              </li>
            </ul>
        </div>
      </Card>

      <Card title="Рекламные сети" hint="Кто сколько заработал">
        <div className="stack-bar">
          {networkTotals.map((n) => (
            <div
              key={n.key}
              style={{
                width: (ratio(n.revenue, revenue) || 0) * 100 + '%',
                background: n.color,
              }}
            />
          ))}
        </div>
        <ul className="legend-list big">
          {networkTotals.map((n) => (
            <li key={n.key}>
              <span className="dot" style={{ background: n.color }} />
              <span>{n.name}</span>
              <b>{usd(n.revenue)}</b>
              <span className="muted">{pct(ratio(n.revenue, revenue))}</span>
            </li>
          ))}
          <li className="total">
              <span />
              <span>Итого</span>
              <b>{usd(revenue)}</b>
              <span className="muted">100 %</span>
            </li>
          </ul>
      </Card>
    </div>
  )
}

// Подробная таблица: сеть × формат — для разбора, почему показов мало или реклама дешёвая.
export function NetworkFormatTable({ rows, open }: { rows: AdRow[]; open?: boolean }) {
  const table = (Object.keys(NETWORKS) as Network[]).flatMap((n) =>
    (Object.keys(FORMATS) as Format[])
      .map((f) => {
        const list = rows.filter((r) => r.network === n && r.format === f)
        return {
          network: n,
          format: f,
          revenue: sum(list, (r) => r.revenue),
          impressions: sum(list, (r) => r.impressions),
          requests: sum(list, (r) => r.requests),
          allFormats: false,
        }
      })
      .filter((x) => x.requests > 0 || x.impressions > 0 || x.revenue > 0)
      // Unity отдаёт запросы общим числом, без мест показа. Такая строка — «все форматы»:
      // показы в ней — сумма по сети, чтобы заполнение считалось честно.
      .map((x, _, all) =>
        x.format === 'other' && x.impressions === 0 && x.requests > 0 && all.some((o) => o.impressions > 0)
          ? {
              ...x,
              revenue: -1,
              impressions: sum(all, (o) => o.impressions),
              allFormats: true,
            }
          : x,
      ),
  )
  if (!table.length) return null
  // Итог — по исходным строкам: строка Unity «Все форматы» повторяет показы сети и в сумму не идёт.
  const totals = { revenue: sum(rows, (r) => r.revenue), impressions: sum(rows, (r) => r.impressions), requests: sum(rows, (r) => r.requests) }

  return (
    <details className="card card-wide details" open={open}>
      <summary>
        <h3>Подробно: сеть × формат</h3>
        <span className="muted small">запросы, показы, заполнение и eCPM каждого блока</span>
      </summary>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Сеть</th>
              <th>Формат</th>
              <th className="num">Доход</th>
              <th className="num">Показы</th>
              <th className="num">eCPM</th>
              <th className="num">Запросы</th>
              <th className="num">Заполнение</th>
            </tr>
          </thead>
          <tbody>
            {table
              .sort((a, b) => b.revenue - a.revenue)
              .map((r) => (
                <tr key={r.network + r.format}>
                  <td>
                    <span className="dot" style={{ background: NETWORKS[r.network].color }} /> {NETWORKS[r.network].name}
                  </td>
                  <td>
                    <span className="tag" style={{ color: FORMATS[r.format].color }}>
                      {r.allFormats ? 'Все форматы' : FORMATS[r.format].name}
                    </span>
                  </td>
                  <td className="num strong">{r.allFormats ? '—' : usd(r.revenue)}</td>
                  <td className="num">{count(r.impressions)}</td>
                  <td className="num">{r.allFormats ? '—' : usdPrecise(cpm(r.revenue, r.impressions))}</td>
                  <td className="num">{r.requests > 0 ? count(r.requests) : '—'}</td>
                  <td className="num">{pct(ratio(r.impressions, r.requests))}</td>
                </tr>
              ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="strong" colSpan={2}>
                Итого
              </td>
              <td className="num strong">{usd(totals.revenue)}</td>
              <td className="num strong">{count(totals.impressions)}</td>
              <td className="num">{usdPrecise(cpm(totals.revenue, totals.impressions))}</td>
              <td className="num strong">{count(totals.requests)}</td>
              <td className="num">{pct(ratio(totals.impressions, totals.requests))}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </details>
  )
}
