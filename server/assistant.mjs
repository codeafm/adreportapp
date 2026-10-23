// Помощник: смотрит на цифры и простыми словами объясняет, что сломалось или выглядит подозрительно.
// Правила без ИИ — работают сразу и бесплатно. Каждое предупреждение говорит, что случилось и что делать.

const NET = { yandex: 'Яндекс', vk: 'VK', unity: 'Unity Ads' }
const FORMAT = { banner: 'баннер', interstitial: 'межстраничная', rewarded: 'за награду', appopen: 'при открытии', other: 'другое' }
const SOURCE = { yandex: 'Яндекс РСЯ', vk: 'VK Реклама', unity: 'Unity Ads', firebase: 'Firebase' }
const ORDER = { error: 0, warn: 1, info: 2, good: 3 }

// Меньше этого дохода в день колебания — просто шум, о них не пишем.
const MIN_DAILY_REVENUE = 0.3

const money = new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
const int = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 })
const usd = (v) => money.format(v || 0)
const count = (v) => int.format(Math.round(v || 0))
const pct = (v) => Math.round(v * 100) + ' %'

export function analyze({ range, rows, sources, issues, players, periodRows = [], today }) {
  const alerts = []
  const add = (a) => alerts.push({ app: null, network: null, ...a, id: alerts.length + ':' + a.title })

  for (const [name, s] of Object.entries(sources)) {
    if (s.configured && !s.ok) add({ level: 'error', title: `${SOURCE[name]} не отдаёт данные`, text: sourceHint(name, s.error), detail: s.error })
  }

  // Порядок внутри одного уровня: сначала деньги (падения, пустые блоки), потом модерация.
  trends(range, rows, today, add)
  emptyBlocks(rows, add)
  moderation(issues, rows, add)

  // players — по играм: { 'Bottle Sort': {...} }.
  for (const [app, p] of Object.entries(players ?? {}))
    // Только для игр, которые шлют наши события уровней (Unity-версия Bottle Sort): у других их просто нет.
    if (p?.customDefinitionsMissing && (p.events?.level_start?.count ?? 0) > 0)
      add({
        level: 'info',
        app,
        title: `${app}: уровни и кнопки рекламы в «Игроках» пока пустые`,
        text: 'В Google Analytics не зарегистрированы параметры событий. Это делается один раз: Firebase → Analytics → Custom definitions → добавить level, placement, result, after, booster. Данные появятся со следующего дня.',
      })

  deadAnalytics(players, periodRows, add)

  // sort устойчивая: внутри уровня остаётся порядок добавления.
  return alerts.sort((a, b) => ORDER[a.level] - ORDER[b.level])
}

function sourceHint(name, error) {
  const e = String(error ?? '')
  if (/401|403|ключ не подходит|token|токен/i.test(e))
    return 'Ключ доступа больше не подходит — скорее всего, истёк или его отозвали. Нажмите на источник вверху страницы и вставьте новый ключ.'
  if (/JSON-ключ/i.test(e)) return 'Не выбран файл ключа сервисного аккаунта. Нажмите на Firebase вверху страницы и выберите JSON-файл.'
  if (/fetch failed|ENOTFOUND|ECONN|timeout/i.test(e)) return 'Сервер сети не ответил — нет интернета или у сети сбой. Обновите страницу через несколько минут.'
  return `Сеть вернула ошибку. Если повторяется — проверьте ключ в настройках источника. Ответ ${SOURCE[name] ?? name}: ${e.slice(0, 160)}`
}

// ---------- модерация VK ----------

function moderation(issues, rows, add) {
  const earning = new Set(rows.filter((r) => r.revenue > 0).map((r) => r.app))
  // Блокировка важна, если игра приносит деньги в других сетях — разблокировка в VK даст ещё доход.
  // Площадка без дохода (давно брошенная игра, сайт) — только «к сведению».
  for (const i of issues.filter((x) => x.kind === 'banned'))
    add({
      level: earning.has(i.app) ? 'warn' : 'info',
      app: i.app,
      network: 'vk',
      title: `VK заблокировал «${i.sourceName}»`,
      text: banHint(i.reason),
      detail: i.reason ? 'Причина VK: ' + i.reason : undefined,
    })
  for (const i of issues.filter((x) => x.kind === 'moderation'))
    add({
      level: 'info',
      app: i.app,
      network: 'vk',
      title: `«${i.sourceName}» на модерации в VK`,
      text: 'Пока площадка на проверке, VK не показывает в ней рекламу. Обычно это 1–3 рабочих дня. Если дольше недели — напишите в поддержку VK Рекламы.',
    })
}

function banHint(reason) {
  const r = String(reason ?? '')
  if (/app-ads|сайт/i.test(r))
    return 'VK не смог проверить app-ads.txt: в карточке приложения в магазине нет ссылки на сайт разработчика. Добавьте в карточку сайт codeafm.dev, положите на него app-ads.txt со строкой VK и отправьте площадку на повторную модерацию.'
  if (/трафик/i.test(r))
    return 'VK посчитал трафик некачественным: накрутка установок, клики ботов или мотивированный трафик. Пока источник трафика не станет чистым, повторная модерация не поможет.'
  if (/контент|правил/i.test(r)) return 'Содержимое площадки нарушает правила VK (например, чужие фильмы). Такие площадки обычно не разблокируют.'
  return 'Откройте площадку в кабинете VK — там написана причина и кнопка повторной модерации.'
}

// ---------- доход: последний полный день против обычного ----------

function sumUp(list) {
  const s = { revenue: 0, requests: 0, impressions: 0 }
  for (const r of list) {
    s.revenue += r.revenue
    s.requests += r.requests
    s.impressions += r.impressions
  }
  return s
}

const div = (a, b) => (b > 0 ? a / b : 0)

function trends(range, rows, today, add) {
  // Сегодняшний день ещё не закончился — сравниваем вчерашний (или последний день периода).
  const last = range.to >= today ? addDays(today, -1) : range.to
  const baseFrom = addDays(last, -7)
  if (baseFrom < range.from) return

  const groups = new Map()
  for (const r of rows) {
    if (r.date < baseFrom || r.date > last) continue
    const key = r.app + '|' + r.network
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(r)
  }

  for (const list of groups.values()) {
    const { app, network } = list[0]
    const day = sumUp(list.filter((r) => r.date === last))
    const week = sumUp(list.filter((r) => r.date < last))
    const base = { revenue: week.revenue / 7, requests: week.requests / 7, impressions: week.impressions / 7 }
    if (base.revenue < MIN_DAILY_REVENUE) continue
    const where = `${app} · ${NET[network]}`

    if (day.requests === 0 && base.requests >= 50) {
      add({
        level: 'error',
        app,
        network,
        title: `${where}: ни одного запроса рекламы`,
        text: `${shortDate(last)} игра не запросила рекламу ни разу, хотя обычно около ${count(base.requests)} запросов в день. Так бывает, если обновление сломало рекламу, SDK не запускается или игру сняли с публикации. Откройте игру на телефоне и проверьте, показывается ли реклама.`,
      })
      continue
    }

    const change = div(day.revenue, base.revenue) - 1
    if (change <= -0.4)
      add({
        level: 'warn',
        app,
        network,
        title: `${where}: доход упал на ${pct(-change)}`,
        text: `${shortDate(last)}: ${usd(day.revenue)} вместо обычных ~${usd(base.revenue)} в день. ${cause(day, base, false)}`,
      })
    else if (change >= 0.8 && day.revenue - base.revenue >= 0.5)
      add({
        level: 'good',
        app,
        network,
        title: `${where}: доход вырос на ${pct(change)}`,
        text: `${shortDate(last)}: ${usd(day.revenue)} против обычных ~${usd(base.revenue)} в день. ${cause(day, base, true)}`,
      })
  }
}

// Доход = запросы × доля заполнения × цена показа. Ищем, какая из трёх частей изменилась сильнее всего.
function cause(day, base, up) {
  const fillDay = div(day.impressions, day.requests)
  const fillBase = div(base.impressions, base.requests)
  const ecpmDay = div(day.revenue, day.impressions) * 1000
  const ecpmBase = div(base.revenue, base.impressions) * 1000
  const parts = [
    { kind: 'requests', ratio: div(day.requests, base.requests) || 1 },
    { kind: 'fill', ratio: div(fillDay, fillBase) || 1 },
    { kind: 'ecpm', ratio: div(ecpmDay, ecpmBase) || 1 },
  ]
  const main = parts.sort((a, b) => (up ? b.ratio - a.ratio : a.ratio - b.ratio))[0]

  if (up) {
    if (main.kind === 'requests') return `Главное — запросов стало больше: ${count(day.requests)} вместо ~${count(base.requests)}. Значит, больше людей играло.`
    if (main.kind === 'fill') return `Главное — реклама стала чаще заполняться: ${pct(fillDay)} запросов с показом вместо ${pct(fillBase)}.`
    return `Главное — реклама подорожала: ${usd(ecpmDay)} за 1000 показов вместо ${usd(ecpmBase)}.`
  }
  if (main.kind === 'requests')
    return `Главная причина — запросов рекламы стало меньше: ${count(day.requests)} вместо ~${count(base.requests)}. Значит, меньше людей играло или игра реже вызывает рекламу. Проверьте установки и отзывы в магазине — нет ли вылетов после обновления.`
  if (main.kind === 'fill')
    return `Главная причина — сеть реже отдаёт рекламу: показ только у ${pct(fillDay)} запросов вместо ${pct(fillBase)}. Чаще всего это временно на стороне сети. Если держится 2–3 дня — проверьте в кабинете, активны ли блоки и не завышена ли минимальная цена.`
  return `Главная причина — реклама подешевела: ${usd(ecpmDay)} за 1000 показов вместо ${usd(ecpmBase)}. Так бывает в начале месяца и в выходные. Если держится неделю — проверьте минимальную цену и порядок сетей в медиации.`
}

// ---------- запросы есть, показов нет ----------

function emptyBlocks(rows, add) {
  const groups = new Map()
  for (const r of rows) {
    // Unity отдаёт запросы без места показа — у этой строки показов не бывает, это не поломка.
    if (r.network === 'unity' && r.format === 'other') continue
    const key = r.app + '|' + r.network + '|' + r.format
    const g = groups.get(key) ?? { app: r.app, network: r.network, format: r.format, requests: 0, impressions: 0, responses: 0 }
    g.requests += r.requests
    g.impressions += r.impressions
    g.responses += r.responses ?? 0
    groups.set(key, g)
  }
  for (const g of groups.values()) {
    if (g.requests < 200 || g.impressions > 0) continue
    // VK участвует в аукционе Яндекса: его «запросы» — это ставки. Отвечал рекламой, но не показался — значит,
    // проиграл аукцион (Яндекс или Unity заплатили больше), это не поломка. Тревога — только если VK не ответил ни разу.
    if (g.network === 'vk' && g.responses > 0) continue
    add({
      level: 'warn',
      app: g.app,
      network: g.network,
      title: `${g.app} · ${NET[g.network]}: «${FORMAT[g.format]}» не показывает рекламу`,
      text:
        g.network === 'vk'
          ? `За период ${count(g.requests)} запросов, а VK ни разу не ответил рекламой. Обычно это значит, что блок выключен, площадка на модерации или в игре указан не тот ID блока. Проверьте блок в кабинете VK.`
          : `За период ${count(g.requests)} запросов и ни одного показа. Пустые запросы портят статистику блока и снижают цену рекламы. Проверьте ID блока в игре и что блок активен в кабинете ${NET[g.network]}.`,
    })
  }
}

// ---------- даты ----------

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function shortDate(iso) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
}

// ---------- аналитика молчит ----------

// Firebase подключён, а игроков за период 0, хотя реклама в игре показывалась — значит, в игре не работает
// Firebase Analytics: модуля нет, он не запускается или в сборке другой google-services.json.
function deadAnalytics(players, periodRows, add) {
  const revenue = new Map()
  for (const r of periodRows) revenue.set(r.app, (revenue.get(r.app) ?? 0) + r.revenue)
  for (const [app, p] of Object.entries(players ?? {})) {
    const earned = revenue.get(app) ?? 0
    if (p?.totals && p.totals.users === 0 && earned >= 0.1)
      add({
        level: 'warn',
        app,
        title: `${app}: аналитика молчит — игроков 0, а реклама приносит ${usd(earned)}`,
        text: 'Firebase подключён к сайту, но игра не присылает в него данные. Проверьте в коде игры: есть ли модуль Firebase Analytics (во Flutter — firebase_analytics), запускается ли он при старте и тот ли google-services.json в сборке.',
      })
  }
}
