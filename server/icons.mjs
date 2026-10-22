// Иконки игр. ID пакета (com.codeafm.bottlesort) берём из Яндекса. Сначала — оригинал из проекта игры,
// уменьшенный в public/icons/<пакет>.png; если его нет — со страницы в RuStore, потом из App Store.
// Ссылки из магазинов храним сутки в cache/icons.json, чтобы не ходить туда при каждом запуске.
import fs from 'node:fs/promises'
import path from 'node:path'

const DAY = 24 * 60 * 60 * 1000
let memory = null

async function load(root) {
  if (memory) return memory
  try {
    memory = JSON.parse(await fs.readFile(path.join(root, 'cache', 'icons.json'), 'utf8'))
  } catch {
    memory = {}
  }
  return memory
}

async function save(root) {
  await fs.mkdir(path.join(root, 'cache'), { recursive: true })
  await fs.writeFile(path.join(root, 'cache', 'icons.json'), JSON.stringify(memory, null, 2), 'utf8')
}

let inflight = null
let local = { at: 0, files: new Map() }

// Файлы в public/icons: перечитываем раз в минуту — новую иконку можно просто положить в папку.
async function localIcons(root) {
  if (Date.now() - local.at < 60_000) return local.files
  const files = new Map()
  try {
    for (const f of await fs.readdir(path.join(root, 'public', 'icons'))) {
      const m = /^(.+)\.(png|webp|jpe?g)$/i.exec(f)
      if (m) files.set(m[1], '/icons/' + encodeURIComponent(f))
    }
  } catch {
    // папки нет — иконки только из магазинов
  }
  local = { at: Date.now(), files }
  return files
}

// { bundle: { icon, iconLarge } } — icon маленькая (для таблицы), iconLarge — исходная картинка.
// Отвечает сразу тем, что уже известно; недостающие иконки ищет в фоне — они появятся при следующем обновлении.
export async function iconsFor(root, bundles) {
  const [store, files] = await Promise.all([load(root), localIcons(root)])
  const remote = bundles.filter((b) => b && !files.has(b))
  const stale = [...new Set(remote.filter((b) => !(store[b] && Date.now() - store[b].at < DAY)))]
  if (stale.length && !inflight) inflight = refresh(root, store, stale).finally(() => (inflight = null))
  const result = {}
  for (const b of bundles) {
    if (!b) continue
    if (files.has(b)) result[b] = { icon: files.get(b), iconLarge: files.get(b) }
    else if (store[b]?.icon) result[b] = store[b]
  }
  return result
}

async function refresh(root, store, bundles) {
  // По три страницы за раз — магазины не любят пачку одновременных запросов.
  for (let i = 0; i < bundles.length; i += 3) {
    const part = bundles.slice(i, i + 3)
    const found = await Promise.all(part.map((b) => lookup(b).catch(() => null)))
    // Не нашли — тоже запоминаем на сутки, чтобы не искать заново каждые 10 секунд.
    part.forEach((b, k) => (store[b] = { ...(found[k] ?? { icon: null, iconLarge: null }), at: Date.now() }))
  }
  await save(root).catch(() => {})
}

async function lookup(bundle) {
  return (await fromRuStore(bundle)) ?? (await fromAppStore(bundle))
}

async function fromRuStore(bundle) {
  const res = await fetch('https://www.rustore.ru/catalog/app/' + encodeURIComponent(bundle), {
    headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'text/html' },
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) return null
  const html = await res.text()
  // Маленькая — готовая уменьшенная копия RuStore, большая — исходный файл иконки.
  const small = /https:\/\/static\.rustore\.ru\/imgproxy\/[^"' ]+?\/preset:web_app_icon_62\/plain\/[^"' ]+/.exec(html)?.[0]
  const large = /https:\/\/static\.rustore\.ru\/\d{4}\/[^"' ]+?\/content\/ICON\/[^"' @]+/.exec(html)?.[0]
  if (!small && !large) return null
  return { icon: small ?? large, iconLarge: large ?? small }
}

async function fromAppStore(bundle) {
  const res = await fetch('https://itunes.apple.com/lookup?country=ru&bundleId=' + encodeURIComponent(bundle), { signal: AbortSignal.timeout(15000) })
  if (!res.ok) return null
  const app = (await res.json()).results?.[0]
  if (!app) return null
  return { icon: app.artworkUrl100 ?? app.artworkUrl512, iconLarge: app.artworkUrl512 ?? app.artworkUrl100 }
}
