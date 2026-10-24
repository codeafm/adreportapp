import type { Players } from '../types'
import { count, pct, ratio } from '../format'
import { Bar, Card } from './ui'

// Что игроки делают в игре, кроме уровней и рекламы: покупки, награды, уведомления. Названия событий — как в
// справочниках игр (у Merge Market — docs/analytics_events.md); список запрашивает сервер (ACTION_EVENTS в api.mjs).
// Чего игра не шлёт, того здесь просто нет.

type Action = { event: string; label: string }

const GROUPS: { title: string; hint: string; color: string; actions: Action[] }[] = [
  {
    title: 'Покупки и улучшения',
    hint: 'На что тратят монеты, алмазы и звёзды',
    color: '#ffcc33',
    actions: [
      { event: 'booster_buy', label: 'Купили бустер в магазине' },
      { event: 'shop_upgrade', label: 'Улучшили здание' },
      { event: 'box_buy', label: 'Купили коробку за монеты' },
      { event: 'cell_unlock', label: 'Открыли полку за монеты' },
      { event: 'coins_exchange', label: 'Обменяли алмазы на монеты' },
      { event: 'spend_virtual_currency', label: 'Потратили монеты' },
    ],
  },
  {
    title: 'Награды и подарки',
    hint: 'Что забирают бесплатно',
    color: '#3fd6a4',
    actions: [
      { event: 'daily_bonus_claimed', label: 'Крутили колесо бонусов' },
      { event: 'gift_collect', label: 'Забрали подарок в уровне' },
      { event: 'achievement_claimed', label: 'Забрали награду за достижение' },
      { event: 'welcome_bonus_claimed', label: 'Получили стартовый подарок' },
      { event: 'earn_virtual_currency', label: 'Получили монеты' },
    ],
  },
  {
    title: 'Прогресс',
    hint: 'Как проходят игру',
    color: '#5cc8ff',
    actions: [
      { event: 'order_complete', label: 'Выполнили заказ' },
      { event: 'level_restart', label: 'Начали уровень заново' },
      { event: 'level_resume', label: 'Вернулись к начатому уровню' },
      { event: 'level_continue', label: 'Продолжили уровень за рекламу' },
      { event: 'progress_reset', label: 'Сбросили весь прогресс' },
    ],
  },
]

const NOTIFICATION_EVENTS = ['notification_receive', 'notification_tap', 'notification_open', 'notification_dismiss']
const OTHER_EVENTS = ['district_offer', 'district_purchase', 'save_failed', ...NOTIFICATION_EVENTS]

// Есть ли что показать — иначе раздел на странице игры не выводим.
export function hasActions(players: Players) {
  return [...GROUPS.flatMap((g) => g.actions.map((a) => a.event)), ...OTHER_EVENTS].some((e) => (players.events[e]?.count ?? 0) > 0)
}

export function ActionsSection({ players }: { players: Players }) {
  const ev = (name: string) => players.events[name] ?? { count: 0, users: 0 }
  const groups = GROUPS.map((g) => ({ ...g, rows: g.actions.map((a) => ({ ...a, ...ev(a.event) })).filter((a) => a.count > 0) })).filter((g) => g.rows.length)

  const offer = ev('district_offer')
  const bought = ev('district_purchase')
  const received = ev('notification_receive').count
  // notification_open — старое имя (Firebase его не принимает), notification_tap — новое.
  const tapped = ev('notification_tap').count + ev('notification_open').count
  const dismissed = ev('notification_dismiss').count
  const saveFailed = ev('save_failed')

  return (
    <div className="grid">
      {groups.map((g) => {
        const max = Math.max(1, ...g.rows.map((r) => r.count))
        return (
          <Card key={g.title} title={g.title} hint={g.hint}>
            <ul className="rank">
              {g.rows.map((r) => (
                <li key={r.event}>
                  <span className="action-label">
                    {r.label}
                    <small className="muted">игроков: {count(r.users)}</small>
                  </span>
                  <Bar value={r.count} max={max} color={g.color} />
                  <b>{count(r.count)}</b>
                </li>
              ))}
            </ul>
          </Card>
        )
      })}

      {offer.count > 0 && (
        <Card title="Новые районы" hint="Скольким игрокам предложили купить район и сколько купили">
          <div className="big-number">{pct(ratio(bought.users, offer.users))}</div>
          <p className="muted">
            купили {count(bought.users)} из {count(offer.users)} игроков, которым показали предложение
          </p>
          <p className="muted small">Окно покупки показано {count(offer.count)} раз, районов куплено {count(bought.count)}.</p>
        </Card>
      )}

      {received + tapped + dismissed > 0 && (
        <Card title="Уведомления" hint="Приходят ли и нажимают ли на них">
          {received > 0 && tapped <= received ? (
            <div className="big-number" style={{ color: '#5cc8ff' }}>
              {pct(ratio(tapped, received))}
            </div>
          ) : (
            <div className="big-number" style={{ color: '#5cc8ff' }}>
              {count(tapped)}
            </div>
          )}
          <p className="muted">
            {received > 0 && tapped <= received ? 'нажали на уведомление' : 'нажатий на уведомления'} — пришло {count(received)}, нажали {count(tapped)}, смахнули {count(dismissed)}
          </p>
          <p className="muted small">«Пришло» Firebase считает только для рассылок; напоминания с самого телефона видны по нажатиям.</p>
        </Card>
      )}

      {saveFailed.count > 0 && (
        <Card title="Сбои сохранения" hint="Игра не смогла записать прогресс">
          <div className="big-number" style={{ color: 'var(--bad)' }}>
            {count(saveFailed.count)}
          </div>
          <p className="muted">раз у {count(saveFailed.users)} игроков — они могут терять пройденное</p>
        </Card>
      )}
    </div>
  )
}
