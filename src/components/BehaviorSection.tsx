import type { Players } from '../types'
import { count, pct, ratio, sum, usd } from '../format'
import { Bar, Card, Empty } from './ui'

const RESULT_COLOR: Record<string, string> = {
  Досмотрел: '#3fd6a4',
  'Закрыл раньше': '#ffcc33',
  'Не загрузилась': '#ff5c7a',
  Показана: '#3fd6a4',
}

export function BehaviorSection({ players }: { players: Players }) {
  const placements = new Map<string, Record<string, number>>()
  for (const r of players.rewarded) {
    const entry = placements.get(r.placement) ?? {}
    entry[r.result] = (entry[r.result] ?? 0) + r.count
    placements.set(r.placement, entry)
  }
  const rewardedRows = [...placements.entries()]
    .map(([placement, results]) => ({ placement, results, total: Object.values(results).reduce((a, b) => a + b, 0) }))
    .sort((a, b) => b.total - a.total)
  const maxRewarded = Math.max(1, ...rewardedRows.map((r) => r.total))

  const shown = sum(players.interstitial.filter((r) => r.result === 'Показана'), (r) => r.count)
  const missed = sum(players.interstitial.filter((r) => r.result !== 'Показана'), (r) => r.count)
  const maxBooster = Math.max(1, ...players.boosters.map((b) => b.count))
  const adSourceTotal = sum(players.adSources, (a) => a.revenue)

  if (!players.rewarded.length && !players.interstitial.length && !players.adSources.length)
    return <Empty>Пока нет событий рекламы от игроков — они появятся после выхода Unity-версии.</Empty>

  return (
    <div className="grid">
      <Card title="Кнопки «за рекламу»" hint="Что игроки берут за просмотр и досматривают ли" wide>
        <ul className="rank">
          {rewardedRows.map((r) => (
            <li key={r.placement} className="rank-multi">
              <span>{r.placement}</span>
              <div className="hbar multi">
                {Object.entries(r.results).map(([result, n]) => (
                  <div key={result} title={`${result}: ${count(n)}`} style={{ width: (n / maxRewarded) * 100 + '%', background: RESULT_COLOR[result] ?? '#8a94b8' }} />
                ))}
              </div>
              <b>{count(r.total)}</b>
            </li>
          ))}
          <li className="total">
            <span>Итого</span>
            <span />
            <b>{count(sum(rewardedRows, (r) => r.total))}</b>
          </li>
        </ul>
        <div className="chips-legend">
          {['Досмотрел', 'Закрыл раньше', 'Не загрузилась'].map((r) => (
            <span key={r}>
              <span className="dot" style={{ background: RESULT_COLOR[r] }} /> {r}
            </span>
          ))}
        </div>
      </Card>
      <Card title="Межстраничная реклама" hint="Должна была выйти — вышла или нет">
        <div className="big-number">{pct(ratio(shown, shown + missed))}</div>
        <p className="muted">
          показана {count(shown)} раз, не успела загрузиться {count(missed)} раз
        </p>
        <ul className="legend-list">
          {players.interstitial.map((r) => (
            <li key={r.after + r.result}>
              <span className="dot" style={{ background: RESULT_COLOR[r.result] ?? '#ff5c7a' }} />
              <span>
                после «{r.after}» — {r.result.toLowerCase()}
              </span>
              <b>{count(r.count)}</b>
            </li>
          ))}
          <li className="total">
            <span />
            <span>Итого</span>
            <b>{count(shown + missed)}</b>
          </li>
        </ul>
      </Card>
      <Card title="Бустеры" hint="Чем пользуются чаще">
        <ul className="rank">
          {players.boosters.map((b) => (
            <li key={b.booster}>
              <span>{b.booster}</span>
              <Bar value={b.count} max={maxBooster} color="#ff9a3d" />
              <b>{count(b.count)}</b>
            </li>
          ))}
          <li className="total">
            <span>Итого</span>
            <span />
            <b>{count(sum(players.boosters, (b) => b.count))}</b>
          </li>
        </ul>
      </Card>
      {players.adSources.length > 0 && (
        <Card title="Доход по сетям — по данным игры" hint="Оценка дохода с каждого показа, которую присылают сами сети (Firebase)">
          <table>
            <thead>
              <tr>
                <th>Сеть</th>
                <th>Формат</th>
                <th className="num">Доход</th>
                <th className="num">Показы</th>
              </tr>
            </thead>
            <tbody>
              {[...players.adSources]
                .sort((a, b) => b.revenue - a.revenue)
                .map((a) => (
                  <tr key={a.source + a.format}>
                    <td className="strong">{a.source || '—'}</td>
                    <td>{a.format || '—'}</td>
                    <td className="num">
                      {usd(a.revenue)} <span className="muted small">{pct(ratio(a.revenue, adSourceTotal))}</span>
                    </td>
                    <td className="num">{count(a.impressions)}</td>
                  </tr>
                ))}
            </tbody>
            <tfoot>
              <tr>
                <td className="strong" colSpan={2}>
                  Итого
                </td>
                <td className="num strong">{usd(adSourceTotal)}</td>
                <td className="num strong">{count(sum(players.adSources, (a) => a.impressions))}</td>
              </tr>
            </tfoot>
          </table>
        </Card>
      )}
    </div>
  )
}
