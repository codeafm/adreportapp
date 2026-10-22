// Доход с рекламы всех приложений из Яндекса, VK и Unity плюс Firebase для игроков. Работает только
// на сервере (Vite dev, serve.mjs или функции Vercel): ключи в браузер не попадают. Все суммы — в долларах США.
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { analyze } from './assistant.mjs'
import { iconsFor } from './icons.mjs'
import { country } from './geo.mjs'

// Ответы сетей по ключу «источник:период» — см. cached().
const cache = new Map()

// Что можно вписать со страницы. Ключ сервисного аккаунта Google — отдельным файлом в secrets.
const EDITABLE = ['YANDEX_OAUTH_TOKEN', 'VK_TOKEN', 'UNITY_API_KEY', 'UNITY_ORG_ID', 'GA4_PROPERTY_ID', 'GA_SERVICE_ACCOUNT_JSON']

export function createApi(env, root) {
  return async function handle(req, res) {
    const url = new URL(req.url, 'http://localhost')
    if (!url.pathname.startsWith('/api/')) return false
    try {
      if (url.pathname === '/api/login' && req.method === 'POST') return (await login(env, req, res), true)
      if (url.pathname === '/api/logout' && req.method === 'POST') {
        res.setHeader('Set-Cookie', `${SESSION}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${cloud(env) ? '; Secure' : ''}`)
        return (sendJson(res, 200, { ok: true }), true)
      }
      // Вход: на Vercel всегда, на своём компьютере — только если задан пароль.
      if (cloud(env) || env.DASHBOARD_PASSWORD) {
        if (!env.DASHBOARD_EMAIL || !env.DASHBOARD_PASSWORD) return (sendJson(res, 503, { error: 'На сервере не заданы DASHBOARD_EMAIL и DASHBOARD_PASSWORD — данные закрыты' }), true)
        if (!signedIn(env, req)) return (sendJson(res, 401, { error: 'login' }), true)
      }

      if (url.pathname === '/api/dashboard') {
        const refresh = url.searchParams.get('refresh') === '1'
        sendJson(res, 200, { ...(await dashboard(env, root, parseRange(url.searchParams), refresh)), auth: Boolean(env.DASHBOARD_PASSWORD) })
      } else if (url.pathname === '/api/settings' && req.method === 'POST') {
        // Ключи принимаем только с этого же компьютера: сайт для себя, наружу его не открываем.
        if (cloud(env)) {
          sendJson(res, 403, { error: 'На Vercel ключи задаются в Vercel → Settings → Environment Variables' })
        } else if (!isLocal(req)) {
          sendJson(res, 403, { error: 'Ключи можно сохранять только с этого компьютера' })
        } else {
          const { name, value } = JSON.parse((await readBody(req)) || '{}')
          if (!EDITABLE.includes(name)) {
            sendJson(res, 400, { error: 'Неизвестный ключ' })
          } else {
            await saveSetting(env, root, name, String(value ?? '').trim())
            cache.clear()
            sendJson(res, 200, { ok: true })
          }
        }
      } else {
        sendJson(res, 404, { error: 'Нет такого адреса' })
      }
    } catch (e) {
      sendJson(res, 500, { error: String(e?.message || e) })
    }
    return true
  }
}

// ---------- вход ----------
// Один владелец: email и пароль — в переменных DASHBOARD_EMAIL и DASHBOARD_PASSWORD (на Vercel — в его настройках,
// в коде их нет). После входа — cookie с подписью от пароля: сменили пароль — все старые входы недействительны.

const SESSION = 'ar_session'
const cloud = (env) => Boolean(env.VERCEL)

function sessionToken(env) {
  return crypto.createHmac('sha256', `${env.DASHBOARD_EMAIL}\n${env.DASHBOARD_PASSWORD}`).update('adreport-session-v1').digest('hex')
}

function same(a, b) {
  const x = Buffer.from(String(a))
  const y = Buffer.from(String(b))
  return x.length === y.length && crypto.timingSafeEqual(x, y)
}

function signedIn(env, req) {
  const cookie = String(req.headers.cookie ?? '')
    .split(';')
    .map((c) => c.trim().split('='))
    .find(([k]) => k === SESSION)?.[1]
  return Boolean(cookie) && same(cookie, sessionToken(env))
}

async function login(env, req, res) {
  if (!env.DASHBOARD_EMAIL || !env.DASHBOARD_PASSWORD) return sendJson(res, 503, { error: 'На сервере не заданы DASHBOARD_EMAIL и DASHBOARD_PASSWORD' })
  let body = {}
  try {
    body = JSON.parse((await readBody(req)) || '{}')
  } catch {
    // пустой или битый запрос — ниже это просто «неверно»
  }
  const ok = same(String(body.email ?? '').trim().toLowerCase(), String(env.DASHBOARD_EMAIL).trim().toLowerCase()) && same(String(body.password ?? ''), env.DASHBOARD_PASSWORD)
  if (!ok) {
    // Пауза на каждую ошибку — подбирать пароль перебором долго.
    await new Promise((r) => setTimeout(r, 1500))
    return sendJson(res, 401, { error: 'Неверный email или пароль' })
  }
  res.setHeader('Set-Cookie', `${SESSION}=${sessionToken(env)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 24 * 3600}${cloud(env) ? '; Secure' : ''}`)
  sendJson(res, 200, { ok: true })
}

// Период: ?from=2026-10-01&to=2026-10-31 (сегодня, вчера, месяц — любые даты) или ?days=14 (последние дни).
// Будущие дни отрезаем — данных за них ещё нет.
function parseRange(q) {
  const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v ?? '')
  const today = ymd(new Date())
  let to = isDate(q.get('to')) ? q.get('to') : today
  if (to > today) to = today
  let from = isDate(q.get('from')) ? q.get('from') : addDays(to, -(clamp(parseInt(q.get('days') || '14', 10) || 14, 1, 90) - 1))
  if (from > to) from = to
  if (from < addDays(to, -365)) from = addDays(to, -365)
  const days = Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86400000) + 1
  return { from, to, days }
}

async function dashboard(env, root, range, refresh) {
  // Помощник всегда смотрит на последние 8 дней — что бы ни было выбрано («Сегодня», прошлый месяц).
  // Если выбранный период их уже включает, второй раз сети не спрашиваем.
  const today = ymd(new Date())
  const recent = { from: addDays(today, -8), to: today, days: 9 }
  const covers = range.from <= recent.from && range.to >= recent.to
  const catalog = await loadCatalog(root)
  const props = gaProperties(env, catalog)
  const [main, window, online] = await Promise.all([
    collect(env, root, range, props, refresh, true),
    covers ? null : collect(env, root, recent, [], refresh),
    cached('online', 30 * SECOND, refresh, () => source(props.length && gaConfigured(env), () => fetchOnline(env, root, props))),
  ])
  const watched = window ?? main

  const { rows, apps, geo } = groupApps(main.raw, catalog, main.issues, main.geo)
  const icons = await iconsFor(root, apps.map((a) => a.bundle))
  for (const a of apps) Object.assign(a, { icon: icons[a.bundle]?.icon ?? null, iconLarge: icons[a.bundle]?.iconLarge ?? null })
  const recentRows = window ? groupApps(window.raw, catalog, []).rows : rows
  const alerts = analyze({ range: recent, rows: recentRows, sources: main.status, issues: main.issues, players: main.players, periodRows: rows, today })
  // Источник, который упал только на последних днях, тоже стоит показать.
  for (const [name, s] of Object.entries(watched.status)) if (main.status[name].ok && !s.ok) main.status[name] = s

  // generatedAt — когда Яндекс (основная сеть, самая частая) отдал эти цифры, а не время запроса страницы.
  // Игры с Firebase, но без рекламы за период — всё равно в списке, ради игроков.
  for (const { app } of props) if (!apps.some((a) => a.name === app)) apps.push({ name: app, firebase: true, platforms: [], networks: [], bundle: null, icon: null, iconLarge: null })
  const data = { range, generatedAt: new Date(main.fetchedAt).toISOString(), sources: main.status, ads: rows, geo, apps, players: main.players, online: online.ok ? online.value : null, alerts }
  return data
}

// Свежесть данных. Замер 22.10: запросы и показы Яндекса за сегодня меняются каждые ~20 с, доход — раз
// в несколько минут; Unity за 2 минуты не изменился ни разу. Поэтому Яндекс за сегодня — каждые 10 с
// (длинный период — раз в минуту, это несколько запросов кусками), VK и Unity — раз в 5 минут.
// Прошлое уже не меняется. Firebase (GA4) медленный и считает дневную квоту — раз в 5 минут
// (прошлое — раз в 30), «онлайн» — раз в 30 с.
const SECOND = 1000
const MINUTE = 60 * SECOND
function ttlFor(name, range) {
  if (name === 'firebase') return range.to < ymd(new Date()) ? 30 * MINUTE : 5 * MINUTE
  // Страны — для разбора, а не для «живых» цифр: хватает раз в 5 минут.
  if (name.endsWith('geo')) return range.to < ymd(new Date()) ? 30 * MINUTE : 5 * MINUTE
  if (range.to < ymd(new Date())) return 30 * MINUTE
  if (name === 'yandex') return range.days > YANDEX_MAX_DAYS ? MINUTE : 10 * SECOND
  return 5 * MINUTE
}

// Кэш одного источника за период. Одновременные запросы ждут один и тот же ответ сети.
// Если сеть разово не ответила (или попросила реже), отдаём прошлый удачный ответ, пока он не старше 10 минут.
function cached(key, ttl, refresh, load) {
  const hit = cache.get(key)
  if (!refresh && hit && Date.now() - hit.at < ttl) return hit.promise
  const at = Date.now()
  const last = hit?.good
  const entry = { at, good: last }
  entry.promise = load().then((v) => {
    if (!v.configured || v.ok) {
      entry.good = { ...v, at }
      return entry.good
    }
    if (last && at - last.at < 10 * MINUTE) return last
    // Подменить нечем — пробуем снова через 20 секунд, а не через весь срок кэша.
    entry.at = Date.now() - Math.max(0, ttl - 20 * SECOND)
    return { ...v, at }
  })
  cache.set(key, entry)
  return entry.promise
}

// Сырые строки всех сетей за период.
async function collect(env, root, range, props, refresh, withGeo = false) {
  const get = (name, load) => cached(`${name}:${range.from}_${range.to}`, ttlFor(name, range), refresh, load)
  const sources = {
    yandex: get('yandex', () => source(env.YANDEX_OAUTH_TOKEN, () => fetchYandex(env, range))),
    vk: get('vk', () => source(env.VK_TOKEN, () => fetchVk(env, range))),
    unity: get('unity', () => source(env.UNITY_API_KEY && env.UNITY_ORG_ID, () => fetchUnity(env, range))),
    firebase: props.length
      ? get('firebase', () => source(gaConfigured(env), () => fetchAllFirebase(env, root, range, props)))
      : { configured: false, ok: true },
  }
  // Страны — только для выбранного периода; их сбой не делает сеть «ошибкой».
  const geoSources = withGeo
    ? [
        get('ygeo', () => source(env.YANDEX_OAUTH_TOKEN, () => fetchYandexGeo(env, range))),
        get('ugeo', () => source(env.UNITY_API_KEY && env.UNITY_ORG_ID, () => fetchUnityGeo(env, range))),
      ]
    : []
  const names = Object.keys(sources)
  const [settled, geoSettled] = await Promise.all([Promise.all(names.map((n) => sources[n])), Promise.all(geoSources)])
  const geo = geoSettled.filter((g) => g.ok && g.value).flatMap((g) => g.value.rows)
  const status = {}
  const raw = []
  const issues = []
  let players = null
  let fetchedAt = Date.now()
  names.forEach((name, i) => {
    const r = settled[i]
    status[name] = { configured: r.configured, ok: r.ok, error: r.error ?? null, note: r.value?.note ?? null }
    if (!r.ok || !r.value) return
    if (name === 'yandex' && r.at) fetchedAt = r.at
    if (name === 'firebase') {
      players = r.value.byApp
      // Часть игр без доступа — источник работает, но с пометкой.
      if (r.value.note) status.firebase.note = r.value.note
    } else raw.push(...r.value.rows)
    // Копия: groupApps дописывает в них название игры, а сами объекты лежат в кэше.
    if (r.value.issues) issues.push(...r.value.issues.map((x) => ({ ...x })))
  })
  return { status, raw, issues, players, fetchedAt, geo }
}

async function source(configured, load) {
  if (!configured) return { configured: false, ok: false }
  try {
    return { configured: true, ok: true, value: await load() }
  } catch (e) {
    return { configured: true, ok: false, error: String(e?.message || e) }
  }
}

// ---------- приложения: одна игра в разных сетях ----------
// apps.json связывает ID из Яндекса, VK и Unity в одну игру. Чего там нет — группируем по имени
// из кабинета сети: «Crowd Clash Android» и «Crowd Clash ios» станут одной игрой «Crowd Clash».

async function loadCatalog(root) {
  try {
    return JSON.parse(await fs.readFile(path.join(root, 'apps.json'), 'utf8'))
  } catch {
    return { apps: [] }
  }
}

const NETWORK_NAMES = { yandex: 'Яндекс', vk: 'VK', unity: 'Unity' }

function cleanName(name) {
  return String(name ?? '')
    .replace(/\b(ios|android)\b/gi, '')
    .replace(/[\s|–—-]+$/, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+\)/g, ')')
    .trim()
}

function appKey(name) {
  return cleanName(name).toLowerCase().split(/[^a-zа-яё0-9]+/i).filter(Boolean).sort().join(' ')
}

function guessPlatform(name) {
  return /\bios\b/i.test(String(name ?? '')) ? 'iOS' : 'Android'
}

function groupApps(raw, catalog, issues, geoRaw = []) {
  const known = new Map()
  const display = new Map()
  const firebase = new Set()
  for (const a of catalog.apps ?? []) {
    display.set(appKey(a.name), a.name)
    if (a.firebase || a.ga4) firebase.add(a.name)
    for (const n of Object.keys(NETWORK_NAMES)) for (const [id, platform] of Object.entries(a[n] ?? {})) known.set(n + ':' + id, { name: a.name, platform })
  }
  const resolve = (network, id, name, platform) => {
    const hit = known.get(network + ':' + id)
    if (hit) return { app: hit.name, platform: hit.platform || platform || guessPlatform(name) }
    const clean = cleanName(name) || `${NETWORK_NAMES[network]} ${id}`
    const k = appKey(clean)
    if (!display.has(k)) display.set(k, clean)
    return { app: display.get(k), platform: platform || guessPlatform(name) }
  }

  const rows = raw.map(({ sourceId, sourceName, bundle, ...r }) => ({ ...r, ...resolve(r.network, sourceId, sourceName, r.platform) }))
  // ID пакета в магазине (для иконки): из apps.json, иначе из Яндекса, иначе из ссылки VK.
  const bundles = new Map((catalog.apps ?? []).filter((a) => a.bundle).map((a) => [a.name, a.bundle]))
  raw.forEach((r, i) => {
    if (r.bundle && /^[a-z][\w]*(\.[\w]+)+$/i.test(r.bundle) && !bundles.has(rows[i].app)) bundles.set(rows[i].app, r.bundle)
  })
  for (const i of issues) if (i.network && i.sourceId) i.app = resolve(i.network, i.sourceId, i.sourceName, i.platform).app

  const apps = new Map()
  for (const r of rows) {
    const a = apps.get(r.app) ?? { name: r.app, firebase: firebase.has(r.app), platforms: [], networks: [], bundle: bundles.get(r.app) ?? null }
    if (!a.platforms.includes(r.platform)) a.platforms.push(r.platform)
    if (!a.networks.includes(r.network)) a.networks.push(r.network)
    apps.set(r.app, a)
  }
  for (const name of firebase) if (!apps.has(name)) apps.set(name, { name, firebase: true, platforms: [], networks: [], bundle: bundles.get(name) ?? null })

  // Страны: та же игра, что в rows; одна страна из нескольких кусков периода — одной строкой.
  const geo = new Map()
  for (const { sourceId, sourceName, bundle, geo: where, ...r } of geoRaw) {
    const { app, platform } = resolve(r.network, sourceId, sourceName, r.platform)
    const c = country(where)
    const key = [app, r.network, platform, c.code ?? c.name].join('|')
    const g = geo.get(key) ?? { app, network: r.network, platform, country: c.name, code: c.code, revenue: 0, requests: 0, impressions: 0 }
    g.revenue += r.revenue
    g.requests += r.requests
    g.impressions += r.impressions
    geo.set(key, g)
  }
  return { rows, apps: [...apps.values()], geo: [...geo.values()] }
}

// ---------- Яндекс РСЯ ----------
// https://yandex.ru/dev/partner-statistics/doc/ru/reference/report

// С разбивкой по дням РСЯ отдаёт не больше 31 дня за запрос («Очень большой период»),
// поэтому длинный период запрашиваем кусками и склеиваем.
const YANDEX_MAX_DAYS = 31

async function fetchYandex(env, range) {
  const periods = []
  for (let from = range.from; from <= range.to; from = addDays(from, YANDEX_MAX_DAYS)) {
    const to = addDays(from, YANDEX_MAX_DAYS - 1)
    periods.push([from, to < range.to ? to : range.to])
  }
  const parts = await Promise.all(periods.map(([from, to]) => fetchYandexPeriod(env, from, to)))
  return { rows: parts.flat() }
}

const first = (v) => (Array.isArray(v) ? v[0] : v)
const measuresOf = (point) => (Array.isArray(point.measures) ? point.measures[0] ?? {} : point.measures ?? {})

// Все приложения кабинета, без фильтра: итог совпадает с «Месячным отчётом» РСЯ.
async function fetchYandexPeriod(env, from, to) {
  const p = new URLSearchParams()
  p.append('lang', 'ru')
  p.append('currency', 'USD')
  p.append('period', from)
  p.append('period', to)
  // impressions — «Показы», как в отчётах кабинета РСЯ; shows там называются «Видимые показы».
  for (const f of ['partner_wo_nds', 'hits', 'impressions']) p.append('field', f)
  p.append('dimension_field', 'date|day')
  p.append('entity_field', 'page_id')
  p.append('entity_field', 'page_caption')
  // domain у приложений — ID пакета в магазине (com.codeafm.bottlesort): по нему ищем иконку.
  p.append('entity_field', 'domain')
  p.append('entity_field', 'block_type')

  const res = await fetchRetry('https://partner.yandex.ru/api/statistics2/get.json?' + p, {
    headers: { Authorization: 'OAuth ' + env.YANDEX_OAUTH_TOKEN },
  })
  const json = await readJson(res, 'Яндекс')
  if (json.result && json.result !== 'ok') throw new Error('Яндекс: ' + (json.message || json.error || JSON.stringify(json).slice(0, 200)))

  const rows = []
  for (const point of json.data?.points ?? []) {
    const d = point.dimensions ?? {}
    const m = measuresOf(point)
    rows.push({
      date: String(first(d.date)).slice(0, 10),
      network: 'yandex',
      sourceId: String(first(d.page_id)),
      sourceName: String(first(d.page_caption) ?? ''),
      bundle: String(first(d.domain) ?? ''),
      platform: null,
      format: formatOf(first(d.block_type)),
      revenue: num(m.partner_wo_nds),
      requests: num(m.hits),
      impressions: num(m.impressions),
    })
  }
  return rows
}

// Страны по Яндексу: весь период одной суммой (по дням не нужно), кусками по 31 дню.
async function fetchYandexGeo(env, range) {
  const parts = []
  for (let from = range.from; from <= range.to; from = addDays(from, YANDEX_MAX_DAYS)) {
    const to = addDays(from, YANDEX_MAX_DAYS - 1)
    const p = new URLSearchParams()
    p.append('lang', 'ru')
    p.append('currency', 'USD')
    p.append('period', from)
    p.append('period', to < range.to ? to : range.to)
    for (const f of ['partner_wo_nds', 'hits', 'impressions']) p.append('field', f)
    p.append('dimension_field', 'geo|country')
    p.append('entity_field', 'page_id')
    p.append('entity_field', 'page_caption')
    parts.push(
      fetchRetry('https://partner.yandex.ru/api/statistics2/get.json?' + p, { headers: { Authorization: 'OAuth ' + env.YANDEX_OAUTH_TOKEN } })
        .then((res) => readJson(res, 'Яндекс'))
        .then((json) =>
          (json.data?.points ?? []).map((point) => {
            const d = point.dimensions ?? {}
            const m = measuresOf(point)
            return {
              network: 'yandex',
              sourceId: String(first(d.page_id)),
              sourceName: String(first(d.page_caption) ?? ''),
              platform: null,
              geo: first(d.geo),
              revenue: num(m.partner_wo_nds),
              requests: num(m.hits),
              impressions: num(m.impressions),
            }
          }),
        ),
    )
  }
  return { rows: (await Promise.all(parts)).flat() }
}

// ---------- VK Рекламная сеть ----------
// https://ads.vk.ru/help/partner/partner_api/partner_statistics_api
// Площадка (group_pad) — это приложение или сайт, блок (pad) — место показа рекламы в нём.

async function fetchVk(env, range) {
  const auth = { headers: { Authorization: 'Bearer ' + env.VK_TOKEN } }
  const [pads, groups] = await Promise.all([vkList('pads.json', auth), vkList('group_pads.json', auth)])
  const groupById = new Map(groups.map((g) => [String(g.id), g]))
  const padById = new Map(pads.map((p) => [String(p.id), p]))
  const platformOf = (pad) => {
    const store = String(pad.group_pad?.platform ?? '')
    return /app store/i.test(store) ? 'iOS' : /web/i.test(store) ? 'Web' : 'Android'
  }

  // Статистику VK отдаёт не больше чем за 92 дня.
  const from = maxDate(range.from, addDays(range.to, -91))
  const rows = []
  for (let i = 0; i < pads.length; i += 50) {
    const ids = pads.slice(i, i + 50).map((p) => p.id)
    const url = `https://target.vk.ru/api/v2/statistics/partner/pads/day.json?date_from=${from}&date_to=${range.to}&id=${ids.join(',')}`
    const json = await readJson(await fetchRetry(url, auth), 'VK')
    for (const item of json.items ?? []) {
      const pad = padById.get(String(item.id))
      if (!pad) continue
      const group = groupById.get(String(pad.group_pad?.id))
      for (const r of item.rows ?? []) {
        const revenue = num(r.amount ?? r.base?.amount)
        const requests = num(r.requests ?? r.base?.requests)
        const impressions = num(r.shows ?? r.base?.shows)
        if (!revenue && !requests && !impressions) continue
        rows.push({
          date: String(r.date).slice(0, 10),
          network: 'vk',
          sourceId: String(pad.group_pad?.id ?? ''),
          sourceName: group?.description ?? pad.group_pad?.description ?? '',
          bundle: /\/catalog\/app\/([\w.]+)/.exec(group?.url ?? '')?.[1] ?? '',
          platform: platformOf(pad),
          format: formatOf(pad.description),
          revenue,
          requests,
          impressions,
        })
      }
    }
  }

  // Модерация площадок — Помощник объяснит, что заблокировано и почему.
  const issues = []
  for (const g of groups) {
    const pad = pads.find((p) => String(p.group_pad?.id) === String(g.id))
    const base = { network: 'vk', sourceId: String(g.id), sourceName: g.description, platform: pad ? platformOf(pad) : null }
    if (g.moderation_status === 'banned') issues.push({ ...base, kind: 'banned', reason: g.moderation_reason_display || '' })
    else if (g.moderation_status === 'new') issues.push({ ...base, kind: 'moderation' })
  }
  return { rows, issues }
}

async function vkList(endpoint, auth) {
  const items = []
  for (let offset = 0; offset < 1000; offset += 50) {
    const json = await readJson(await fetchRetry(`https://target.vk.ru/api/v2/${endpoint}?limit=50&offset=${offset}`, auth), 'VK')
    items.push(...(json.items ?? []))
    if ((json.items ?? []).length < 50 || items.length >= (json.count ?? 0)) break
  }
  return items
}

// ---------- Unity Ads ----------
// https://docs.unity.com/en-us/monetization/performance-and-analytics/api/monetization-stats-api

async function fetchUnity(env, range) {
  const p = new URLSearchParams({
    fields: 'adrequest_count,start_count,view_count,revenue_sum',
    groupBy: 'placement,game,platform',
    scale: 'day',
    start: range.from + 'T00:00:00Z',
    end: range.to + 'T23:59:59Z',
  })
  const url = `https://monetization.api.unity.com/stats/v1/operate/organizations/${encodeURIComponent(env.UNITY_ORG_ID)}?${p}`
  const res = await fetchRetry(url, { headers: { Authorization: 'Token ' + env.UNITY_API_KEY, Accept: 'application/json' } })
  const json = await readJson(res, 'Unity')
  const list = Array.isArray(json) ? json : json.data ?? json.rows ?? []

  const rows = []
  for (const r of list) {
    const date = String(r.timestamp ?? r.date ?? '').slice(0, 10)
    if (!date) continue
    rows.push({
      date,
      network: 'unity',
      sourceId: String(r.source_game_id ?? r.game ?? ''),
      sourceName: String(r.source_name ?? ''),
      platform: String(r.platform ?? '').toLowerCase() === 'ios' ? 'iOS' : 'Android',
      // Unity отдаёт запросы без места показа (placement пустой) — такие строки идут в «Другое».
      format: formatOf(r.placement),
      revenue: num(r.revenue_sum ?? r.revenue),
      requests: num(r.adrequest_count),
      // У баннеров Unity считает только «старты», просмотров у них 0.
      impressions: num(r.view_count) || num(r.start_count),
    })
  }
  return { rows }
}

// Страны по Unity: весь период одной суммой.
async function fetchUnityGeo(env, range) {
  const p = new URLSearchParams({
    fields: 'adrequest_count,start_count,view_count,revenue_sum',
    groupBy: 'country,game,platform',
    scale: 'all',
    start: range.from + 'T00:00:00Z',
    end: range.to + 'T23:59:59Z',
  })
  const url = `https://monetization.api.unity.com/stats/v1/operate/organizations/${encodeURIComponent(env.UNITY_ORG_ID)}?${p}`
  const json = await readJson(await fetchRetry(url, { headers: { Authorization: 'Token ' + env.UNITY_API_KEY, Accept: 'application/json' } }), 'Unity')
  const list = Array.isArray(json) ? json : json.data ?? []
  return {
    rows: list.map((r) => ({
      network: 'unity',
      sourceId: String(r.source_game_id ?? ''),
      sourceName: String(r.source_name ?? ''),
      platform: String(r.platform ?? '').toLowerCase() === 'ios' ? 'iOS' : 'Android',
      geo: r.country,
      revenue: num(r.revenue_sum),
      requests: num(r.adrequest_count),
      impressions: num(r.view_count) || num(r.start_count),
    })),
  }
}

// ---------- Firebase / Google Analytics 4 ----------
// У каждой игры с Firebase свой ресурс GA4: номер — в apps.json ("ga4"). Сервисному аккаунту нужна
// роль «Читатель» в каждом ресурсе (или сразу во всём аккаунте Google Analytics).

// Игры с ресурсом GA4. GA4_PROPERTY_ID из .env — для игры с "firebase": true без своего номера.
function gaProperties(env, catalog) {
  const list = []
  for (const a of catalog.apps ?? []) {
    const property = a.ga4 || (a.firebase ? env.GA4_PROPERTY_ID : '')
    if (property) list.push({ app: a.name, property: String(property) })
  }
  return list
}

let gaCache = null
const gaConfigured = (env) => Boolean(env.GA_SERVICE_ACCOUNT_JSON || env.GOOGLE_APPLICATION_CREDENTIALS)

async function gaClient(env, root) {
  // На Vercel ключ лежит в переменной GA_SERVICE_ACCOUNT_JSON (весь JSON или он же в base64), на компьютере — файлом.
  // Файл читаем сами: если его нет, библиотека Google роняет весь сервер необработанной ошибкой.
  let text = String(env.GA_SERVICE_ACCOUNT_JSON ?? '').trim()
  if (text && !text.startsWith('{')) text = Buffer.from(text, 'base64').toString('utf8')
  if (!text)
    try {
      text = await fs.readFile(path.resolve(root, env.GOOGLE_APPLICATION_CREDENTIALS), 'utf8')
    } catch {
      throw new Error('Нет JSON-ключа сервисного аккаунта — выберите файл в окне Firebase')
    }
  if (gaCache?.text === text) return gaCache.client
  const { BetaAnalyticsDataClient } = await import('@google-analytics/data')
  gaCache = { text, client: new BetaAnalyticsDataClient({ credentials: JSON.parse(text) }) }
  return gaCache.client
}

const noAccess = (e) => (/PERMISSION_DENIED|permission/i.test(String(e?.message)) ? 'нет доступа — добавьте сервисный аккаунт «Читателем» в этот ресурс GA4' : String(e?.message || e).slice(0, 160))

// Все игры сразу. Игра без доступа не ломает остальные — она попадает в пометку источника.
async function fetchAllFirebase(env, root, range, props) {
  const client = await gaClient(env, root)
  const results = await Promise.all(props.map((p) => fetchFirebase(client, p.property, range).then((v) => ({ ...p, v }), (e) => ({ ...p, e }))))
  const failed = results.filter((r) => r.e)
  if (failed.length === results.length) throw new Error(failed.map((r) => `${r.app}: ${noAccess(r.e)}`).join('; '))
  return {
    byApp: Object.fromEntries(results.filter((r) => r.v).map((r) => [r.app, r.v])),
    note: failed.length ? failed.map((r) => `${r.app}: ${noAccess(r.e)}`).join('; ') : null,
  }
}

// Сколько играет прямо сейчас (последние 30 минут) — по каждой игре и платформе.
async function fetchOnline(env, root, props) {
  const client = await gaClient(env, root)
  const out = {}
  await Promise.all(
    props.map(async ({ app, property }) => {
      try {
        const [report] = await client.runRealtimeReport({ property: `properties/${property}`, dimensions: [{ name: 'platform' }], metrics: [{ name: 'activeUsers' }] })
        const platforms = (report.rows ?? []).map((r) => ({ name: r.dimensionValues?.[0]?.value ?? '', users: num(r.metricValues?.[0]?.value) }))
        out[app] = { now: platforms.reduce((a, p) => a + p.users, 0), platforms }
      } catch {
        // нет доступа к этой игре — просто без «онлайн»
      }
    }),
  )
  return out
}

async function fetchFirebase(client, propertyId, range) {
  const property = `properties/${propertyId}`
  const dateRanges = [{ startDate: range.from, endDate: range.to }]
  const run = async (request) => {
    const [report] = await client.runReport({ property, dateRanges, ...request })
    return (report.rows ?? []).map((row) => ({
      d: (row.dimensionValues ?? []).map((v) => v.value ?? ''),
      m: (row.metricValues ?? []).map((v) => num(v.value)),
    }))
  }
  const eventIn = (names) => ({ filter: { fieldName: 'eventName', inListFilter: { values: names } } })
  // Отчёты по своим параметрам (уровень, кнопка рекламы) работают, только когда параметры
  // зарегистрированы в GA4 как custom definitions. Пока нет — показываем подсказку, а не ошибку.
  const optional = async (request) => {
    try {
      return { rows: await run(request), error: null }
    } catch (e) {
      return { rows: [], error: String(e?.message || e) }
    }
  }

  const [totals, daily, platforms, countries, adSources, events, levels, rewarded, interstitial, boosters, screens] = await Promise.all([
    run({ metrics: [{ name: 'totalUsers' }, { name: 'newUsers' }, { name: 'sessions' }] }),
    run({
      dimensions: [{ name: 'date' }],
      metrics: ['activeUsers', 'newUsers', 'sessions', 'userEngagementDuration', 'totalAdRevenue', 'publisherAdImpressions'].map((name) => ({ name })),
      orderBys: [{ dimension: { dimensionName: 'date' } }],
    }),
    run({ dimensions: [{ name: 'platform' }], metrics: [{ name: 'activeUsers' }] }),
    run({ dimensions: [{ name: 'country' }], metrics: [{ name: 'activeUsers' }], orderBys: [{ metric: { metricName: 'activeUsers' }, desc: true }], limit: 12 }),
    run({ dimensions: [{ name: 'adSourceName' }, { name: 'adFormat' }], metrics: [{ name: 'totalAdRevenue' }, { name: 'publisherAdImpressions' }] }),
    run({
      dimensions: [{ name: 'eventName' }],
      metrics: [{ name: 'eventCount' }, { name: 'totalUsers' }],
      dimensionFilter: eventIn(['tutorial_begin', 'tutorial_complete', 'level_start', 'level_complete', 'level_fail', 'level_restart', 'booster_use', 'rewarded_ad', 'interstitial_ad', 'ad_impression', 'earn_virtual_currency', 'spend_virtual_currency']),
    }),
    optional({
      dimensions: [{ name: 'customEvent:level' }, { name: 'eventName' }],
      metrics: [{ name: 'eventCount' }, { name: 'totalUsers' }],
      dimensionFilter: eventIn(['level_start', 'level_complete', 'level_fail']),
      limit: 5000,
    }),
    optional({
      dimensions: [{ name: 'customEvent:placement' }, { name: 'customEvent:result' }],
      metrics: [{ name: 'eventCount' }],
      dimensionFilter: eventIn(['rewarded_ad']),
    }),
    optional({
      dimensions: [{ name: 'customEvent:after' }, { name: 'customEvent:result' }],
      metrics: [{ name: 'eventCount' }],
      dimensionFilter: eventIn(['interstitial_ad']),
    }),
    optional({
      dimensions: [{ name: 'customEvent:booster' }],
      metrics: [{ name: 'eventCount' }],
      dimensionFilter: eventIn(['booster_use']),
    }),
    run({
      dimensions: [{ name: 'unifiedScreenName' }],
      metrics: [{ name: 'screenPageViews' }],
      orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
      limit: 12,
    }),
  ])

  const levelMap = new Map()
  for (const r of levels.rows) {
    const level = parseInt(r.d[0], 10)
    if (!Number.isFinite(level)) continue
    const entry = levelMap.get(level) ?? { level, starts: 0, completes: 0, fails: 0, players: 0 }
    if (r.d[1] === 'level_start') {
      entry.starts += r.m[0]
      entry.players = Math.max(entry.players, r.m[1])
    } else if (r.d[1] === 'level_complete') entry.completes += r.m[0]
    else if (r.d[1] === 'level_fail') entry.fails += r.m[0]
    levelMap.set(level, entry)
  }

  return {
    totals: { users: totals[0]?.m[0] ?? 0, newUsers: totals[0]?.m[1] ?? 0, sessions: totals[0]?.m[2] ?? 0 },
    daily: daily.map((r) => ({
      date: `${r.d[0].slice(0, 4)}-${r.d[0].slice(4, 6)}-${r.d[0].slice(6, 8)}`,
      activeUsers: r.m[0],
      newUsers: r.m[1],
      sessions: r.m[2],
      engagementSec: r.m[3],
      adRevenue: r.m[4],
      adImpressions: r.m[5],
    })),
    platforms: platforms.map((r) => ({ name: r.d[0], users: r.m[0] })),
    countries: countries.map((r) => ({ name: r.d[0], users: r.m[0] })),
    adSources: adSources.map((r) => ({ source: r.d[0], format: r.d[1], revenue: r.m[0], impressions: r.m[1] })),
    events: Object.fromEntries(events.map((r) => [r.d[0], { count: r.m[0], users: r.m[1] }])),
    levels: [...levelMap.values()].sort((a, b) => a.level - b.level),
    rewarded: rewarded.rows.map((r) => ({ placement: r.d[0], result: r.d[1], count: r.m[0] })),
    interstitial: interstitial.rows.map((r) => ({ after: r.d[0], result: r.d[1], count: r.m[0] })),
    boosters: boosters.rows.map((r) => ({ booster: r.d[0], count: r.m[0] })),
    screens: screens.map((r) => ({ name: r.d[0], views: r.m[0] })),
    customDefinitionsMissing: Boolean(levels.error || rewarded.error),
  }
}

// ---------- ключи со страницы ----------

async function saveSetting(env, root, name, value) {
  if (name === 'GA_SERVICE_ACCOUNT_JSON') {
    let parsed
    try {
      parsed = JSON.parse(value)
    } catch {
      throw new Error('Это не JSON. Вставьте весь файл ключа сервисного аккаунта целиком.')
    }
    if (parsed.type !== 'service_account' || !parsed.private_key || !parsed.client_email)
      throw new Error('Это не ключ сервисного аккаунта Google (нет type=service_account, private_key, client_email).')
    const file = './secrets/ga-service-account.json'
    await fs.mkdir(path.join(root, 'secrets'), { recursive: true })
    await fs.writeFile(path.join(root, file), JSON.stringify(parsed, null, 2), 'utf8')
    env.GOOGLE_APPLICATION_CREDENTIALS = file
    await writeEnvLine(root, 'GOOGLE_APPLICATION_CREDENTIALS', file)
    return
  }
  if (/[\r\n]/.test(value)) throw new Error('Ключ должен быть одной строкой')
  env[name] = value
  await writeEnvLine(root, name, value)
}

async function writeEnvLine(root, name, value) {
  const file = path.join(root, '.env')
  let text = ''
  try {
    text = await fs.readFile(file, 'utf8')
  } catch {
    // .env ещё нет — создадим
  }
  const lines = text.split(/\r?\n/)
  const i = lines.findIndex((l) => l.startsWith(name + '='))
  if (i >= 0) lines[i] = `${name}=${value}`
  else lines.push(`${name}=${value}`)
  await fs.writeFile(file, lines.join('\n').replace(/\n*$/, '\n'), 'utf8')
}

function isLocal(req) {
  const ip = req.socket?.remoteAddress || ''
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1'
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (chunk) => {
      data += chunk
      if (data.length > 200_000) reject(new Error('Слишком большой запрос'))
    })
    req.on('end', () => resolve(data))
    req.on('error', reject)
  })
}

// ---------- общее ----------

function formatOf(value) {
  const s = String(value ?? '').toLowerCase()
  if (/banner|баннер|\b\d{3}x\d{2,3}\b/.test(s)) return 'banner'
  if (/reward|вознагр|награ/.test(s)) return 'rewarded'
  if (/interstitial|межстранич|itr|fullscreen|полноэкран/.test(s)) return 'interstitial'
  if (/open|открыт/.test(s)) return 'appopen'
  return 'other'
}

// Разовый сбой связи («fetch failed») — повторяем через секунду. Ответы сети с ошибкой не повторяем.
async function fetchRetry(url, options, tries = 2) {
  for (let i = 1; ; i++) {
    try {
      return await fetch(url, options)
    } catch (e) {
      if (i >= tries) throw e
      await new Promise((r) => setTimeout(r, 1000))
    }
  }
}

async function readJson(res, name) {
  const text = await res.text()
  if (!res.ok) {
    const hint = res.status === 401 || res.status === 403 ? ' — ключ не подходит или у него нет доступа' : ''
    throw new Error(`${name}: ошибка ${res.status}${hint}. ${text.slice(0, 200)}`)
  }
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`${name}: ответ не JSON: ${text.slice(0, 120)}`)
  }
}

function sendJson(res, status, body) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(body))
}

function num(v) {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v))
}

function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return ymd(d)
}

function maxDate(a, b) {
  return a > b ? a : b
}
