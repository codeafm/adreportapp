// Пример данных для просмотра дашборда, пока ключи не подключены. На экране всегда помечен как пример.
import type { AdRow, Dashboard, Format, Network, Platform } from './types'
import { daysBetween } from './format'

function rand(seed: number) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

export function demoDashboard(from: string, to: string): Dashboard {
  const dates = daysBetween(from, to)
  const days = dates.length
  const r = rand(42 + days)

  // Порядок величин — как у Flutter-версии в РСЯ в октябре; это всё равно пример.
  const base: [Network, Format, number, number, number][] = [
    ['yandex', 'interstitial', 1700, 0.98, 4.8],
    ['yandex', 'rewarded', 1750, 0.96, 3.4],
    ['yandex', 'banner', 9000, 0.4, 0.12],
    ['vk', 'interstitial', 600, 0.6, 3.9],
    ['vk', 'rewarded', 600, 0.55, 3.1],
    ['vk', 'banner', 4000, 0.35, 0.2],
    ['unity', 'interstitial', 300, 0.5, 2.2],
    ['unity', 'rewarded', 300, 0.6, 1.6],
    ['unity', 'banner', 2500, 0.3, 0.14],
  ]
  // Несколько игр разного размера — как в настоящем кабинете.
  const games: [string, number][] = [
    ['Bottle Sort', 1],
    ['Merge Market', 0.55],
    ['Panda Mahjong', 0.2],
    ['Bubble Pop', 0.08],
  ]
  const ads: AdRow[] = []
  dates.forEach((date, i) => {
    const growth = 0.85 + (i / Math.max(1, dates.length - 1)) * 0.3
    for (const [app, size] of games)
      for (const platform of ['Android', 'iOS'] as Platform[]) {
        const share = (platform === 'Android' ? 1 : 0.08) * size
        for (const [network, format, req, fill, ecpm] of base) {
          const requests = Math.round(req * share * growth * (0.85 + r() * 0.3))
          const impressions = Math.round(requests * fill * (format === 'banner' ? 1 : 0.45))
          ads.push({ app, date, network, platform, format, requests, impressions, revenue: (impressions * ecpm * (0.8 + r() * 0.4)) / 1000 })
        }
      }
  })

  const levels = Array.from({ length: 60 }, (_, i) => {
    const level = i + 1
    const players = Math.round(900 * Math.pow(0.955, i) * (level <= 3 ? 1.05 : 1))
    const hard = level % 10 === 5 || level === 25
    const starts = Math.round(players * (hard ? 1.9 : 1.25))
    const completes = Math.round(players * (hard ? 0.72 : 0.93))
    return { level, players, starts, completes, fails: Math.round((starts - completes) * 0.6) }
  })

  return {
    demo: true,
    range: { from: dates[0], to: dates[dates.length - 1], days },
    generatedAt: new Date().toISOString(),
    sources: {
      yandex: { configured: false, ok: false, error: null, note: null },
      vk: { configured: false, ok: false, error: null, note: null },
      unity: { configured: false, ok: false, error: null, note: null },
      firebase: { configured: false, ok: false, error: null, note: null },
    },
    ads,
    geo: games.flatMap(([app, size]) =>
      (
        [
          ['Россия', 'RU', 0.78, 0.95],
          ['Казахстан', 'KZ', 0.07, 0.8],
          ['Беларусь', 'BY', 0.05, 0.75],
          ['Узбекистан', 'UZ', 0.05, 0.3],
          ['Таджикистан', 'TJ', 0.03, 0.25],
          ['Германия', 'DE', 0.02, 2.4],
        ] as const
      ).map(([country, code, share, price]) => {
        const impressions = Math.round(160000 * size * share)
        return {
          app,
          network: 'yandex' as const,
          platform: 'Android' as const,
          country,
          code,
          impressions,
          requests: Math.round(impressions / (0.35 + price * 0.1)),
          revenue: (impressions * 0.55 * price) / 1000,
        }
      }),
    ),
    apps: games.map(([name]) => ({ name, firebase: name === 'Bottle Sort', platforms: ['Android', 'iOS'], networks: ['yandex', 'vk', 'unity'] })),
    alerts: [
      {
        id: 'demo-1',
        level: 'warn',
        app: 'Panda Mahjong',
        network: 'yandex',
        title: 'Panda Mahjong · Яндекс: доход упал на 55 %',
        text: 'Вчера: 0,40 $ вместо обычных ~0,90 $ в день. Главная причина — запросов рекламы стало меньше. Значит, меньше людей играло или игра реже вызывает рекламу.',
      },
      {
        id: 'demo-2',
        level: 'good',
        app: 'Bottle Sort',
        network: 'yandex',
        title: 'Bottle Sort · Яндекс: доход вырос на 90 %',
        text: 'Вчера: 11,20 $ против обычных ~5,90 $ в день. Главное — реклама подорожала.',
      },
    ],
    online: {
      'Bottle Sort': {
        now: 37,
        platforms: [
          { name: 'Android', users: 34 },
          { name: 'iOS', users: 3 },
        ],
      },
      'Merge Market': { now: 12, platforms: [{ name: 'Android', users: 12 }] },
    },
    players: {
      'Bottle Sort': {
        totals: { users: 4420, newUsers: 1650, sessions: 31000 },
        daily: dates.map((date, i) => {
          const activeUsers = Math.round(520 + i * 6 + r() * 60)
          return {
            date,
            activeUsers,
            newUsers: Math.round(110 + r() * 40),
            sessions: Math.round(activeUsers * (2.2 + r() * 0.4)),
            // В GA4 это сумма по всем игрокам за день, как и в настоящих данных.
            engagementSec: activeUsers * (1100 + r() * 300),
            adRevenue: 6 + r() * 2,
            adImpressions: Math.round(9000 + r() * 1500),
            uninstalls: Math.round(30 + r() * 20),
          }
        }),
        platforms: [
          { name: 'Android', users: 4100 },
          { name: 'iOS', users: 320 },
        ],
        countries: [
          { name: 'Россия', users: 2600 },
          { name: 'Таджикистан', users: 640 },
          { name: 'Узбекистан', users: 420 },
          { name: 'Казахстан', users: 310 },
          { name: 'Беларусь', users: 180 },
          { name: 'Киргизия', users: 140 },
        ],
        adSources: [
          { source: 'Yandex', format: 'Interstitial', revenue: 48, impressions: 9500 },
          { source: 'Yandex', format: 'Rewarded', revenue: 29, impressions: 8400 },
          { source: 'VK', format: 'Interstitial', revenue: 14, impressions: 3600 },
          { source: 'Unity Ads', format: 'Rewarded', revenue: 4, impressions: 2500 },
          { source: 'Yandex', format: 'Banner', revenue: 11, impressions: 130000 },
        ],
        events: {
          tutorial_begin: { count: 1450, users: 1450 },
          tutorial_complete: { count: 1180, users: 1180 },
          level_start: { count: 41000, users: 3900 },
          level_complete: { count: 33000, users: 3700 },
          level_fail: { count: 5200, users: 1900 },
          level_restart: { count: 7400, users: 2100 },
          booster_use: { count: 9100, users: 2300 },
          rewarded_ad: { count: 6100, users: 1700 },
          interstitial_ad: { count: 11200, users: 2900 },
        },
        levels,
        rewarded: [
          { placement: 'Награда за победу ×2', result: 'Досмотрел', count: 2100 },
          { placement: 'Награда за победу ×2', result: 'Закрыл раньше', count: 160 },
          { placement: 'Подсказка за рекламу', result: 'Досмотрел', count: 1300 },
          { placement: '+5 ходов после проигрыша', result: 'Досмотрел', count: 900 },
          { placement: 'Подарок ×2', result: 'Досмотрел', count: 640 },
          { placement: 'Монеты за рекламу', result: 'Досмотрел', count: 520 },
          { placement: 'Колесо: попытка за рекламу', result: 'Досмотрел', count: 310 },
          { placement: 'Подсказка за рекламу', result: 'Не загрузилась', count: 90 },
        ],
        interstitial: [
          { after: 'Победа', result: 'Показана', count: 8700 },
          { after: 'Победа', result: 'Не загрузилась', count: 420 },
          { after: 'Проигрыш', result: 'Показана', count: 1900 },
          { after: 'Проигрыш', result: 'Не загрузилась', count: 180 },
        ],
        boosters: [
          { booster: 'Подсказка', count: 4300 },
          { booster: 'Отмена хода', count: 3200 },
          { booster: '+Бутылка', count: 1600 },
        ],
        screens: [
          { name: 'Игра', views: 40000 },
          { name: 'Победа', views: 33000 },
          { name: 'Главное меню', views: 9000 },
          { name: 'Карта уровней', views: 4100 },
          { name: 'Магазин', views: 1300 },
        ],
        customDefinitionsMissing: false,
      },
    },
  }
}
