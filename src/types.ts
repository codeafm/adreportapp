export type Network = 'yandex' | 'vk' | 'unity'
export type Platform = 'Android' | 'iOS' | 'Web'
export type Format = 'banner' | 'interstitial' | 'rewarded' | 'appopen' | 'other'
export type SourceName = 'yandex' | 'vk' | 'unity' | 'firebase'

export interface AdRow {
  // Название игры: из apps.json или из кабинета сети.
  app: string
  date: string
  network: Network
  platform: Platform
  format: Format
  revenue: number
  requests: number
  impressions: number
}

// Доход по стране за весь период (Яндекс и Unity).
export interface GeoRow {
  app: string
  network: Network
  platform: Platform
  country: string
  // Код ISO (RU, US); null — «Не определено» и непризнанные территории.
  code: string | null
  revenue: number
  requests: number
  impressions: number
}

export interface SourceStatus {
  configured: boolean
  ok: boolean
  error: string | null
  note: string | null
}

export interface LevelRow {
  level: number
  starts: number
  completes: number
  fails: number
  players: number
}

export interface Players {
  // Всего за период: уникальные игроки, новые, сессии.
  totals: { users: number; newUsers: number; sessions: number }
  // uninstalls — удалили игру в этот день (Android шлёт app_remove сам).
  daily: { date: string; activeUsers: number; newUsers: number; sessions: number; engagementSec: number; adRevenue: number; adImpressions: number; uninstalls?: number }[]
  // Страны — по-русски, как в доходе.
  platforms: { name: string; users: number }[]
  countries: { name: string; users: number }[]
  adSources: { source: string; format: string; revenue: number; impressions: number }[]
  events: Record<string, { count: number; users: number }>
  levels: LevelRow[]
  rewarded: { placement: string; result: string; count: number }[]
  interstitial: { after: string; result: string; count: number }[]
  boosters: { booster: string; count: number }[]
  screens: { name: string; views: number }[]
  // Загрузки рекламы (шаги <игра>_ad_load_requested / load_failed): сколько раз просили у сети и сколько не загрузилось.
  adLoads?: { requested: number; failed: number } | null
  // Показы рекламы без названия места: пришли до регистрации параметра в GA4, в карточки не попали.
  unlabeledAds?: number
  // В GA4 не зарегистрирован level / placement: отчёт по ним недоступен.
  levelsMissing?: boolean
  adsMissing?: boolean
  customDefinitionsMissing: boolean
}

export interface Dashboard {
  range: { from: string; to: string; days: number }
  generatedAt: string
  sources: Record<SourceName, SourceStatus>
  ads: AdRow[]
  geo?: GeoRow[]
  // Firebase по играм: { 'Bottle Sort': {...} }.
  players: Record<string, Players> | null
  // Играют прямо сейчас (последние 30 минут), по играм.
  online?: Record<string, Online> | null
  apps: AppInfo[]
  alerts: Alert[]
  // На сервере включён вход — показываем кнопку «Выйти».
  auth?: boolean
  // Сайт работает на Vercel: ключи там задаются в настройках Vercel, а не со страницы.
  cloud?: boolean
  demo?: boolean
}

export interface Online {
  now: number
  platforms: { name: string; users: number }[]
}

export interface AppInfo {
  name: string
  // У игры есть Firebase Analytics — показываем вкладку «Игроки».
  firebase: boolean
  platforms: Platform[]
  networks: Network[]
  // Иконка из RuStore или App Store; null — не нашли, рисуем буквы.
  icon?: string | null
  iconLarge?: string | null
}

export type AlertLevel = 'error' | 'warn' | 'info' | 'good'

// Сообщение Помощника: что случилось и что с этим делать.
export interface Alert {
  id: string
  level: AlertLevel
  title: string
  text: string
  detail?: string
  app: string | null
  network: Network | null
}

export const NETWORKS: Record<Network, { name: string; color: string }> = {
  yandex: { name: 'Яндекс', color: '#ffcc33' },
  vk: { name: 'VK', color: '#3b8bff' },
  unity: { name: 'Unity Ads', color: '#a98bff' },
}

export const FORMATS: Record<Format, { name: string; color: string }> = {
  rewarded: { name: 'За награду', color: '#ff5c7a' },
  interstitial: { name: 'Межстраничная', color: '#ff9a3d' },
  banner: { name: 'Баннер', color: '#3fd6a4' },
  appopen: { name: 'При открытии', color: '#5cc8ff' },
  other: { name: 'Другое', color: '#8a94b8' },
}

export const SOURCES: Record<SourceName, string> = {
  yandex: 'Яндекс РСЯ',
  vk: 'VK Реклама',
  unity: 'Unity Ads',
  firebase: 'Firebase',
}
