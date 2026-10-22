import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Clock, MousePointerClick, Smartphone, UserPlus, Users } from 'lucide-react'
import type { Players } from '../types'
import { count, duration, pct, ratio, shortDate, sum } from '../format'
import { axis, Bar, Card, grid, Kpi, tooltipStyle } from './ui'

const COUNTRY_RU: Record<string, string> = {
  Russia: 'Россия',
  Tajikistan: 'Таджикистан',
  Uzbekistan: 'Узбекистан',
  Kazakhstan: 'Казахстан',
  Belarus: 'Беларусь',
  Kyrgyzstan: 'Киргизия',
  Ukraine: 'Украина',
  Armenia: 'Армения',
  Azerbaijan: 'Азербайджан',
  Georgia: 'Грузия',
  Moldova: 'Молдова',
  Turkey: 'Турция',
  Germany: 'Германия',
  'United States': 'США',
  '(not set)': 'не определена',
}

export function PlayersSection({ players }: { players: Players }) {
  const daily = players.daily.map((d) => ({ ...d, label: shortDate(d.date) }))
  const last = players.daily[players.daily.length - 1]
  const avgDau = players.daily.length ? sum(players.daily, (d) => d.activeUsers) / players.daily.length : 0
  const newUsers = sum(players.daily, (d) => d.newUsers)
  const sessions = sum(players.daily, (d) => d.sessions)
  const engagement = sum(players.daily, (d) => d.engagementSec)
  const activeSum = sum(players.daily, (d) => d.activeUsers)
  const maxCountry = Math.max(1, ...players.countries.map((c) => c.users))
  const platformTotal = sum(players.platforms, (p) => p.users)
  const tutorialBegin = players.events.tutorial_begin?.users ?? 0
  const tutorialDone = players.events.tutorial_complete?.users ?? 0

  return (
    <>
      <div className="kpis">
        <Kpi icon={<Users size={16} />} label="Игроков в день" value={count(avgDau)} hint={last ? `сегодня ${count(last.activeUsers)}` : undefined} accent="#5cc8ff" />
        <Kpi icon={<UserPlus size={16} />} label="Новые игроки" value={count(newUsers)} hint="за период" accent="#3fd6a4" />
        <Kpi icon={<MousePointerClick size={16} />} label="Сессии" value={count(sessions)} hint={`${(sessions / Math.max(1, activeSum)).toFixed(1)} на игрока в день`} accent="#a98bff" />
        <Kpi icon={<Clock size={16} />} label="Время в игре" value={duration(engagement / Math.max(1, activeSum))} hint="в среднем на игрока в день" accent="#ffcc33" />
        <Kpi icon={<Smartphone size={16} />} label="Прошли обучение" value={pct(ratio(tutorialDone, tutorialBegin))} hint={`${count(tutorialDone)} из ${count(tutorialBegin)}`} accent="#ff5c7a" />
      </div>
      <div className="grid">
        <Card title="Активность игроков" hint="Сколько людей играло каждый день и сколько пришло новых" wide>
          <div className="chart">
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={daily} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                <defs>
                  <linearGradient id="gActive" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#5cc8ff" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="#5cc8ff" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gNew" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3fd6a4" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="#3fd6a4" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid {...grid} />
                <XAxis dataKey="label" {...axis} />
                <YAxis {...axis} />
                <Tooltip {...tooltipStyle} formatter={(v, n) => [count(Number(v)), n === 'activeUsers' ? 'Играли' : 'Новые']} />
                <Legend formatter={(v) => (v === 'activeUsers' ? 'Играли' : 'Новые')} />
                <Area type="monotone" dataKey="activeUsers" stroke="#5cc8ff" strokeWidth={2} fill="url(#gActive)" isAnimationActive={false} />
                <Area type="monotone" dataKey="newUsers" stroke="#3fd6a4" strokeWidth={2} fill="url(#gNew)" isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="Страны" hint="Откуда игроки">
          <ul className="rank">
            {players.countries.map((c) => (
              <li key={c.name}>
                <span>{COUNTRY_RU[c.name] ?? c.name}</span>
                <Bar value={c.users} max={maxCountry} color="#5cc8ff" />
                <b>{count(c.users)}</b>
              </li>
            ))}
            <li className="total">
              <span>Итого</span>
              <span />
              <b>{count(sum(players.countries, (c) => c.users))}</b>
            </li>
          </ul>
        </Card>
        <Card title="Платформы">
          <ul className="legend-list big">
            {players.platforms.map((p) => (
              <li key={p.name}>
                <span className="dot" style={{ background: /ios/i.test(p.name) ? '#e8edff' : '#3fd6a4' }} />
                <span>{p.name}</span>
                <b>{count(p.users)}</b>
                <span className="muted">{pct(ratio(p.users, platformTotal))}</span>
              </li>
            ))}
            <li className="total">
              <span />
              <span>Итого</span>
              <b>{count(platformTotal)}</b>
              <span className="muted">100 %</span>
            </li>
          </ul>
          {players.screens.length > 0 && (
            <>
              <h4 className="sub">Экраны</h4>
              <ul className="rank compact">
                {players.screens.slice(0, 6).map((s) => (
                  <li key={s.name}>
                    <span>{s.name}</span>
                    <Bar value={s.views} max={players.screens[0].views} color="#a98bff" />
                    <b>{count(s.views)}</b>
                  </li>
                ))}
                <li className="total">
                  <span>Итого</span>
                  <span />
                  <b>{count(sum(players.screens, (s) => s.views))}</b>
                </li>
              </ul>
            </>
          )}
        </Card>
      </div>
    </>
  )
}
