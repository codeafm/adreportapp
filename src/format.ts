const money = new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
const moneyPrecise = new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 3 })
const int = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 })
const one = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 })

export const usd = (v: number) => money.format(v || 0)
export const usdPrecise = (v: number) => moneyPrecise.format(v || 0)
export const count = (v: number) => int.format(Math.round(v || 0))
export const pct = (v: number) => (Number.isFinite(v) ? one.format(v * 100) + ' %' : '—')
export const ratio = (a: number, b: number) => (b > 0 ? a / b : NaN)
export const cpm = (revenue: number, impressions: number) => (impressions > 0 ? (revenue / impressions) * 1000 : 0)

export function shortDate(iso: string) {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }).replace('.', '')
}

export function longDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', weekday: 'short' })
}

export function duration(sec: number) {
  if (!Number.isFinite(sec) || sec <= 0) return '—'
  const total = Math.round(sec)
  const m = Math.floor(total / 60)
  const s = total % 60
  return m > 0 ? `${m} мин ${s} с` : `${s} с`
}

export function isoDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function daysBetween(from: string, to: string) {
  const out: string[] = []
  const d = new Date(from + 'T00:00:00')
  const end = new Date(to + 'T00:00:00')
  while (d <= end) {
    out.push(isoDate(d))
    d.setDate(d.getDate() + 1)
  }
  return out
}

// Период на сайте: сегодня, вчера, последние N дней ('7d'), этот месяц или прошлый месяц ('2026-09').
export type Period = string

export const QUICK_PERIODS: { key: Period; label: string }[] = [
  { key: 'today', label: 'Сегодня' },
  { key: 'yesterday', label: 'Вчера' },
  { key: '7d', label: '7 дней' },
  { key: '30d', label: '30 дней' },
  { key: 'month', label: 'Этот месяц' },
  { key: '90d', label: '90 дней' },
]

export function periodRange(p: Period): { from: string; to: string } {
  const today = new Date()
  const now = isoDate(today)
  if (p === 'today') return { from: now, to: now }
  if (p === 'yesterday') {
    const d = new Date(today)
    d.setDate(d.getDate() - 1)
    return { from: isoDate(d), to: isoDate(d) }
  }
  if (p === 'month') return { from: now.slice(0, 8) + '01', to: now }
  const days = /^(\d+)d$/.exec(p)
  if (days) {
    const from = new Date(today)
    from.setDate(from.getDate() - (Number(days[1]) - 1))
    return { from: isoDate(from), to: now }
  }
  const [y, m] = p.split('-').map(Number)
  if (!y || !m) return { from: now.slice(0, 8) + '01', to: now }
  const last = new Date(y, m, 0)
  return { from: isoDate(new Date(y, m - 1, 1)), to: isoDate(last < today ? last : today) }
}

export function monthKey(d: Date) {
  return isoDate(d).slice(0, 7)
}

export function monthName(key: string) {
  const [y, m] = key.split('-').map(Number)
  const name = new Date(y, m - 1, 1).toLocaleDateString('ru-RU', { month: 'long' })
  return name[0].toUpperCase() + name.slice(1) + ' ' + y
}

// Прошлые месяцы для списка «Другой месяц»: текущий — это кнопка «Этот месяц».
export function pastMonths(count = 12) {
  const now = new Date()
  return Array.from({ length: count }, (_, i) => monthKey(new Date(now.getFullYear(), now.getMonth() - i - 1, 1)))
}

export const sum = <T,>(list: T[], pick: (t: T) => number) => list.reduce((a, t) => a + (pick(t) || 0), 0)
