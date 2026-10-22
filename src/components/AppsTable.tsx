import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import type { AdRow, AppInfo, Network, Online, Players } from '../types'
import { NETWORKS } from '../types'
import { count, cpm, pct, ratio, sum, usd, usdPrecise } from '../format'
import { AppIcon, Bar, Card } from './ui'

const NETS = Object.keys(NETWORKS) as Network[]
// Сначала только самые доходные игры — чтобы таблица не растягивала страницу.
const TOP = 8

// Все приложения одной таблицей: сколько принесла каждая игра и из каких сетей. Клик — страница игры.
type Props = {
  apps: AppInfo[]
  rows: AdRow[]
  // Firebase по играм — колонки «Игроки» и «Онлайн», если хоть у одной игры он есть.
  players?: Record<string, Players> | null
  online?: Record<string, Online> | null
  onOpen: (name: string) => void
}

export function AppsTable({ apps, rows, players, online, onOpen }: Props) {
  const analytics = Boolean((players && Object.keys(players).length) || (online && Object.keys(online).length))
  const [all, setAll] = useState(false)
  const list = apps
    .map((a) => {
      const own = rows.filter((r) => r.app === a.name)
      return {
        ...a,
        revenue: sum(own, (r) => r.revenue),
        impressions: sum(own, (r) => r.impressions),
        requests: sum(own, (r) => r.requests),
        byNet: Object.fromEntries(
          NETS.map((n) => [
            n,
            sum(
              own.filter((r) => r.network === n),
              (r) => r.revenue,
            ),
          ]),
        ) as Record<Network, number>,
      }
    })
    .filter((a) => a.revenue > 0 || a.requests > 0 || players?.[a.name] || online?.[a.name])
    .sort((a, b) => b.revenue - a.revenue)
  const total = sum(list, (a) => a.revenue)
  const top = Math.max(0, ...list.map((a) => a.revenue))
  const totalImpressions = sum(list, (a) => a.impressions)
  const totalRequests = sum(list, (a) => a.requests)

  return (
    <Card title="Приложения" hint="Нажмите на игру, чтобы открыть её подробную страницу" wide>
      <div className="table-wrap">
        <table className="apps-table">
          <thead>
            <tr>
              <th>Приложение</th>
              <th className="num">Доход</th>
              <th className="share-head">Доля</th>
              {NETS.map((n) => (
                <th key={n} className="num">
                  <span className="dot" style={{ background: NETWORKS[n].color }} /> {NETWORKS[n].name}
                </th>
              ))}
              <th className="num">eCPM</th>
              <th className="num">Заполнение</th>
              {analytics && <th className="num">Игроки</th>}
              {analytics && <th className="num">Онлайн</th>}
              <th />
            </tr>
          </thead>
          <tbody>
            {(all ? list : list.slice(0, TOP)).map((a) => (
              <tr key={a.name} className="clickable" onClick={() => onOpen(a.name)}>
                <td>
                  <div className="app-cell">
                    <AppIcon name={a.name} src={a.icon} size={34} />
                    <div>
                      <div className="app-name">{a.name}</div>
                      <div className="badges">
                        {a.platforms.map((p) => (
                          <span key={p} className="badge">
                            {p}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="num strong">{usd(a.revenue)}</td>
                <td className="share-cell">
                  <Bar value={a.revenue} max={top} color="#3fd6a4" />
                  <span className="muted small">{pct(ratio(a.revenue, total))}</span>
                </td>
                {NETS.map((n) => (
                  <td key={n} className={'num' + (a.byNet[n] > 0 ? '' : ' muted')}>
                    {a.byNet[n] > 0 ? usd(a.byNet[n]) : '—'}
                  </td>
                ))}
                <td className="num">{usdPrecise(cpm(a.revenue, a.impressions))}</td>
                <td className="num">{pct(ratio(a.impressions, a.requests))}</td>
                {analytics && <td className={'num' + (players?.[a.name] ? '' : ' muted')}>{players?.[a.name] ? count(players[a.name].totals.users) : '—'}</td>}
                {analytics && (
                  <td className={'num' + (online?.[a.name] ? '' : ' muted')}>
                    {online?.[a.name] ? (
                      <span className="online-cell">
                        <span className={'live-dot' + (online[a.name].now ? '' : ' off')} /> {count(online[a.name].now)}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                )}
                <td className="go">
                  <ChevronRight size={16} />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="strong">Итого · {list.length} прил.</td>
              <td className="num strong">{usd(total)}</td>
              <td />
              {NETS.map((n) => (
                <td key={n} className="num">
                  {usd(sum(list, (a) => a.byNet[n]))}
                </td>
              ))}
              <td className="num">{usdPrecise(cpm(total, totalImpressions))}</td>
              <td className="num">{pct(ratio(totalImpressions, totalRequests))}</td>
              {analytics && <td className="num">{count(sum(list, (a) => players?.[a.name]?.totals.users ?? 0))}</td>}
              {analytics && <td className="num">{count(sum(list, (a) => online?.[a.name]?.now ?? 0))}</td>}
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      {list.length > TOP && (
        <button className="link more" onClick={() => setAll(!all)}>
          {all ? 'Свернуть' : `Показать все приложения (${list.length})`}
        </button>
      )}
      <p className="muted small table-note">
        {count(totalImpressions)} показов из {count(totalRequests)} запросов. Суммы — вознаграждение без НДС в долларах, как в кабинетах сетей.
      </p>
    </Card>
  )
}
