// Страны из разных сетей в одном виде. Яндекс пишет страну по-русски («США», «Киргизия»), Unity —
// кодом ISO («US», «KG»). Приводим всё к коду и короткому русскому названию, чтобы строки совпали.

const names = new Intl.DisplayNames(['ru'], { type: 'region' })

// Устаревшие и служебные коды, у которых Intl то же название, что у настоящей страны (SU — «Россия», UK — «Великобритания»).
const RETIRED = new Set([
  'SU',
  'UK',
  'DD',
  'FX',
  'YU',
  'ZR',
  'TP',
  'BU',
  'CS',
  'NT',
  'AN',
  'EU',
  'EZ',
  'UN',
  'QO',
  'XA',
  'XB',
  'ZZ',
  'CT',
  'DY',
  'FQ',
  'HV',
  'JT',
  'MI',
  'NH',
  'NQ',
  'PC',
  'PU',
  'PZ',
  'RH',
  'VD',
  'WK',
  'YD',
])

// Русское название → код, для всех кодов, которые знает Intl.
const byName = new Map()
for (let a = 65; a <= 90; a++)
  for (let b = 65; b <= 90; b++) {
    const code = String.fromCharCode(a, b)
    if (RETIRED.has(code)) continue
    try {
      const n = names.of(code)
      if (n && n !== code && !byName.has(n.toLowerCase())) byName.set(n.toLowerCase(), code)
    } catch {
      // такого кода нет
    }
  }

// Как страну называет Яндекс, если не так, как Intl.
const ALIASES = {
  сша: 'US',
  'южная корея': 'KR',
  белоруссия: 'BY',
  беларусь: 'BY',
  кыргызстан: 'KG',
  молдавия: 'MD',
  'объединённые арабские эмираты': 'AE',
  'объединенные арабские эмираты': 'AE',
  чехия: 'CZ',
  македония: 'MK',
  'северная македония': 'MK',
  турция: 'TR',
  палестина: 'PS',
  'кот-д’ивуар': 'CI',
}

// Короткие привычные названия вместо официальных из Intl.
const SHORT = { US: 'США', KR: 'Южная Корея', GB: 'Великобритания', AE: 'ОАЭ', CZ: 'Чехия', MK: 'Северная Македония', HK: 'Гонконг' }

function nameOf(code) {
  if (SHORT[code]) return SHORT[code]
  try {
    return names.of(code) ?? code
  } catch {
    return code
  }
}

// { code: 'US' | null, name: 'США' }. Без кода — непризнанные территории и «не определено».
export function country(value) {
  const s = String(value ?? '').trim()
  if (/^[A-Z]{2}$/.test(s) && s !== 'ZZ' && s !== 'XX') return { code: s, name: nameOf(s) }
  const code = ALIASES[s.toLowerCase()] ?? byName.get(s.toLowerCase()) ?? null
  if (code) return { code, name: nameOf(code) }
  return { code: null, name: s && !/^(zz|xx|unknown|не определено|-)$/i.test(s) ? s : 'Не определено' }
}
