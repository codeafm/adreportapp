import { useState } from 'react'
import { CheckCircle2, CircleDashed, TriangleAlert, X } from 'lucide-react'
import type { Dashboard, SourceName } from '../types'
import { SOURCES } from '../types'

const ORDER: SourceName[] = ['yandex', 'vk', 'unity', 'firebase']

export function SourceBar({ data, onSetup }: { data: Dashboard; onSetup: (s: SourceName) => void }) {
  return (
    <div className="sources">
      {ORDER.map((name) => {
        const s = data.sources[name]
        const state = data.demo ? 'demo' : !s.configured ? 'off' : s.ok ? 'ok' : 'error'
        const label = state === 'ok' ? 'подключено' : state === 'error' ? 'ошибка' : state === 'demo' ? 'пример' : 'не подключено'
        return (
          <button key={name} className={'source source-' + state} onClick={() => onSetup(name)} title={s.error ?? s.note ?? ''}>
            {state === 'ok' ? <CheckCircle2 size={16} /> : state === 'error' ? <TriangleAlert size={16} /> : <CircleDashed size={16} />}
            <span className="source-name">{SOURCES[name]}</span>
            <span className="source-state">{label}</span>
          </button>
        )
      })}
    </div>
  )
}

type Field = { name: string; label: string; placeholder: string; kind?: 'text' | 'secret' | 'json' }

const STEPS: Record<SourceName, { title: string; steps: string[]; fields: Field[]; link?: { href: string; text: string } }> = {
  yandex: {
    title: 'Яндекс РСЯ — доход, запросы и показы',
    steps: [
      'Нажмите «Получить токен Яндекса» — откроется Яндекс под вашим аккаунтом с кабинетом РСЯ.',
      'Разрешите доступ. Яндекс покажет длинный токен — скопируйте его.',
      'Вставьте токен в поле ниже и нажмите «Сохранить и проверить».',
    ],
    fields: [{ name: 'YANDEX_OAUTH_TOKEN', label: 'OAuth-токен Яндекса', placeholder: 'y0_AgAAAA…', kind: 'secret' }],
    link: { href: 'https://oauth.yandex.ru/authorize?response_type=token&client_id=da092e6d50b443308da7a28e638070b9', text: 'Получить токен Яндекса' },
  },
  vk: {
    title: 'VK Реклама — доход и показы по блокам',
    steps: [
      'Откройте настройки кабинета VK Рекламной сети → «Токены доступа».',
      'Создайте токен для Reporting API и скопируйте его.',
      'Вставьте в поле ниже. Все приложения и блоки VK сайт найдёт сам.',
    ],
    fields: [{ name: 'VK_TOKEN', label: 'Токен Reporting API', placeholder: 'вставьте токен', kind: 'secret' }],
    link: { href: 'https://ads.vk.ru/hq/settings', text: 'Открыть настройки VK' },
  },
  unity: {
    title: 'Unity Ads — доход по местам показа',
    steps: [
      'Unity Cloud → Unity Ads Monetization → «Настройки» → API management.',
      'В блоке «Monetization Stats API Access» скопируйте ключ (или нажмите Create Api Key).',
      'Вставьте ключ и номер организации (Organization ID — в адресе Unity Cloud после /organizations/). Все игры организации сайт найдёт сам.',
    ],
    fields: [
      { name: 'UNITY_API_KEY', label: 'Ключ Monetization Stats API', placeholder: 'вставьте ключ', kind: 'secret' },
      { name: 'UNITY_ORG_ID', label: 'Organization ID', placeholder: '18968334641592', kind: 'text' },
    ],
    link: { href: 'https://cloud.unity.com/home/organizations/18968334641592', text: 'Открыть Unity Cloud' },
  },
  firebase: {
    title: 'Firebase — игроки, уровни, кнопки рекламы',
    steps: [
      'Google Cloud → IAM → Service Accounts → создайте сервисный аккаунт → Keys → Add key → JSON. Выберите этот файл в поле ниже — он один на все игры.',
      'У каждой игры свой ресурс Google Analytics: Firebase → проект игры → ⚙ Project settings → Integrations → Google Analytics → номер ресурса (Property ID). Впишите его в apps.json как "ga4" у этой игры.',
      'Google Analytics → Администратор → Управление доступом к ресурсу → добавьте email сервисного аккаунта с ролью «Читатель» — в каждом ресурсе (или сразу во всём аккаунте).',
    ],
    fields: [
      { name: 'GA_SERVICE_ACCOUNT_JSON', label: 'Ключ сервисного аккаунта (JSON-файл)', placeholder: '', kind: 'json' },
    ],
    link: { href: 'https://console.firebase.google.com/project/bottle-sort-23297/settings/integrations', text: 'Открыть Firebase' },
  },
}

async function saveSetting(name: string, value: string) {
  const res = await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, value }) })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || res.statusText)
}

export function SetupPanel({ source, data, onClose, onSaved }: { source: SourceName; data: Dashboard; onClose: () => void; onSaved: () => Promise<void> }) {
  const info = STEPS[source]
  const s = data.sources[source]
  const [values, setValues] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function save() {
    setBusy(true)
    setMessage(null)
    try {
      const filled = info.fields.filter((f) => (values[f.name] ?? '').trim())
      if (!filled.length) throw new Error('Сначала вставьте ключ')
      for (const f of filled) await saveSetting(f.name, values[f.name])
      setValues({})
      await onSaved()
      setMessage('Сохранено. Статус обновлён ниже.')
    } catch (e) {
      setMessage(String((e as Error).message || e))
    } finally {
      setBusy(false)
    }
  }

  function readFile(name: string, file: File | undefined) {
    if (!file) return
    file.text().then((text) => setValues((v) => ({ ...v, [name]: text })))
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="panel" onClick={(e) => e.stopPropagation()}>
        <button className="panel-close" onClick={onClose} aria-label="Закрыть">
          <X size={18} />
        </button>
        <h3>{info.title}</h3>
        {!data.demo && s.configured && s.ok && <p className="ok-text">Подключено и работает.</p>}
        {!data.demo && s.error && <p className="error-text">{s.error}</p>}
        {s.note && <p className="muted">{s.note}</p>}
        <ol className="steps">
          {info.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        {info.link && (
          <a className="btn btn-ghost" href={info.link.href} target="_blank" rel="noreferrer">
            {info.link.text} ↗
          </a>
        )}
        {data.cloud ? (
          <p className="muted">
            Это сайт в интернете: ключи здесь задаются в Vercel → Settings → Environment Variables, затем Deployments → Redeploy. С компьютера их переносит команда <code>npm run vercel:env</code>.
          </p>
        ) : (
          <>
        <div className="fields">
          {info.fields.map((f) => (
            <label key={f.name} className="field">
              <span>{f.label}</span>
              {f.kind === 'json' ? (
                <>
                  <input type="file" accept=".json,application/json" onChange={(e) => readFile(f.name, e.target.files?.[0])} />
                  {values[f.name] && <span className="muted small">файл выбран</span>}
                </>
              ) : (
                <input
                  type={f.kind === 'secret' ? 'password' : 'text'}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={f.placeholder}
                  value={values[f.name] ?? ''}
                  onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                />
              )}
            </label>
          ))}
        </div>
        <button className="btn" onClick={save} disabled={busy}>
          {busy ? 'Проверяю…' : 'Сохранить и проверить'}
        </button>
        {message && <p className={message.startsWith('Сохранено') ? 'ok-text' : 'error-text'}>{message}</p>}
        <p className="muted small">Ключ сохранится в файл .env (или secrets) только на этом компьютере. Страница его больше не показывает и никуда не отправляет.</p>
          </>
        )}
      </div>
    </div>
  )
}
