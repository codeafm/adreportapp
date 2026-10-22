import { Bar as RBar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { Players } from '../types'
import { count, pct, ratio, sum } from '../format'
import { axis, Card, Empty, grid, tooltipStyle } from './ui'

export function LevelsSection({ players }: { players: Players }) {
  if (players.customDefinitionsMissing && !players.levels.length)
    return (
      <Empty>
        Уровни появятся, когда в Google Analytics будут зарегистрированы параметры событий (level, placement, result…). Как это сделать — Docs/ANALYTICS.md в проекте игры, раздел «Один раз настроить в консоли».
      </Empty>
    )
  if (!players.levels.length) return <Empty>Пока нет событий уровней — они появятся после выхода Unity-версии.</Empty>

  const levels = players.levels.slice(0, 120).map((l) => ({
    ...l,
    label: String(l.level),
    winRate: ratio(l.completes, l.starts),
  }))
  // Сложные уровни: много попыток на прохождение и низкая доля побед.
  const hardest = [...levels]
    .filter((l) => l.starts >= 20)
    .sort((a, b) => a.winRate - b.winRate)
    .slice(0, 8)
  const first = levels[0]?.players || 1
  const drop = levels
    .slice(1)
    .map((l, i) => ({ level: l.level, lost: ratio(levels[i].players - l.players, levels[i].players) }))
    .filter((d) => Number.isFinite(d.lost))
    .sort((a, b) => b.lost - a.lost)
    .slice(0, 6)

  return (
    <div className="grid">
      <Card title="Воронка уровней" hint="Столбики — сколько игроков дошло до уровня, линия — доля побед в попытках" wide>
        <div className="chart">
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={levels} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
              <CartesianGrid {...grid} />
              <XAxis dataKey="label" {...axis} interval={Math.max(0, Math.ceil(levels.length / 10) - 1)} />
              <YAxis yAxisId="p" {...axis} />
              <YAxis yAxisId="r" orientation="right" {...axis} domain={[0, 1]} tickFormatter={(v) => Math.round(v * 100) + '%'} />
              <Tooltip
                {...tooltipStyle}
                labelFormatter={(l) => 'Уровень ' + l}
                formatter={(v, n) => (n === 'winRate' ? [pct(Number(v)), 'Побед в попытках'] : [count(Number(v)), 'Дошли до уровня'])}
              />
              <Legend formatter={(v) => (v === 'winRate' ? 'Доля побед' : 'Дошли до уровня')} />
              <RBar yAxisId="p" dataKey="players" fill="#3b8bff" radius={[4, 4, 0, 0]} isAnimationActive={false} />
              <Line yAxisId="r" type="monotone" dataKey="winRate" stroke="#ffcc33" strokeWidth={2} dot={false} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <p className="muted small">
          До последнего уровня на графике дошло {pct(ratio(levels[levels.length - 1].players, first))} игроков, начавших первый.
        </p>
      </Card>
      <Card title="Самые сложные уровни" hint="Меньше всего побед на попытку">
        <table>
          <thead>
            <tr>
              <th>Уровень</th>
              <th className="num">Попыток</th>
              <th className="num">Побед</th>
              <th className="num">Проигрышей</th>
            </tr>
          </thead>
          <tbody>
            {hardest.map((l) => (
              <tr key={l.level}>
                <td className="strong">{l.level}</td>
                <td className="num">{count(l.starts)}</td>
                <td className="num warn">{pct(l.winRate)}</td>
                <td className="num">{count(l.fails)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="strong">Итого</td>
              <td className="num strong">{count(sum(hardest, (l) => l.starts))}</td>
              <td className="num">{pct(ratio(sum(hardest, (l) => l.starts * l.winRate), sum(hardest, (l) => l.starts)))}</td>
              <td className="num strong">{count(sum(hardest, (l) => l.fails))}</td>
            </tr>
          </tfoot>
        </table>
      </Card>
      <Card title="Где бросают игру" hint="Какая доля игроков не дошла до следующего уровня">
        <table>
          <thead>
            <tr>
              <th>После уровня</th>
              <th className="num">Ушло</th>
            </tr>
          </thead>
          <tbody>
            {drop.map((d) => (
              <tr key={d.level}>
                <td className="strong">{d.level - 1}</td>
                <td className="num warn">{pct(d.lost)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="strong">Итого до уровня {levels[levels.length - 1].level}</td>
              <td className="num warn strong">{pct(1 - (ratio(levels[levels.length - 1].players, first) || 0))}</td>
            </tr>
          </tfoot>
        </table>
      </Card>
    </div>
  )
}
