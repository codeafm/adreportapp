import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, BarChart3, Flag, Gamepad2, LogOut, RefreshCw, Sparkles, Users } from 'lucide-react'
import type { Dashboard, Platform, SourceName } from './types'
import { NETWORKS } from './types'
import { demoDashboard } from './demo'
import { isoDate, longDate, monthKey, monthName, pastMonths, periodRange, QUICK_PERIODS, sum } from './format'
import type { Period } from './format'
import { SetupPanel, SourceBar } from './components/Sources'
import { NetworkFormatTable, RevenueCharts, RevenueKpis } from './components/AdsSection'
import { Assistant } from './components/Assistant'
import { AppsTable } from './components/AppsTable'
import { CountriesTable } from './components/CountriesTable'
import { Login } from './components/Login'
import { PlayersSection } from './components/PlayersSection'
import { LevelsSection } from './components/LevelsSection'
import { BehaviorSection } from './components/BehaviorSection'
import { AppIcon, Empty, SectionTitle } from './components/ui'

type PlatformFilter = 'all' | Platform
// Пока выбран период с сегодняшним днём, страница сама спрашивает сайт каждые 10 секунд.
// Как часто сайт ходит в сами сети — решает сервер (ttlFor в server/api.mjs).
const AUTO_REFRESH_MS = 10_000
type Tab = 'revenue' | 'players'

function stored<T extends string | number>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key)
    if (v == null) return fallback
    return (typeof fallback === 'number' ? Number(v) : v) as T
  } catch {
    return fallback
  }
}

// Страница игры — в адресе (#app=Bottle%20Sort): её можно открыть закладкой, «Назад» в браузере работает.
function appFromUrl() {
  const m = /^#app=(.+)$/.exec(window.location.hash)
  return m ? decodeURIComponent(m[1]) : ''
}

function remember(key: string, value: string | number) {
  try {
    localStorage.setItem(key, String(value))
  } catch {
    // в приватном режиме хранилище недоступно — просто не запоминаем
  }
}

function clock(at: string) {
  return new Date(at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}

// Играют прямо сейчас — по данным Firebase за последние 30 минут.
function OnlineChip({ n }: { n: number }) {
  return (
    <span className="online-chip" title="Игроки за последние 30 минут (Firebase, обновляется каждые 30 секунд)">
      <span className="live-dot" /> {n} {n % 10 === 1 && n % 100 !== 11 ? 'играет' : 'играют'} сейчас
    </span>
  )
}

// Свои часы: тикают только в этой подписи, не перерисовывая всю страницу.
function LiveBadge({ at }: { at: string }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 5_000)
    return () => window.clearInterval(id)
  }, [])
  const sec = Math.max(0, Math.round((now - Date.parse(at)) / 1000))
  const ago = sec < 15 ? 'только что' : sec < 60 ? `${sec} с назад` : sec < 3600 ? `${Math.floor(sec / 60)} мин назад` : 'в ' + clock(at)
  return (
    <span className="live" title="Обновляется само: Яндекс — каждые 10 секунд, VK и Unity — раз в 5 минут">
      <span className="live-dot" /> в реальном времени · обновлено {ago}
    </span>
  )
}

export default function App() {
  // По умолчанию — этот месяц, с 1-го числа по сегодня.
  const [period, setPeriod] = useState<Period>(() => {
    const p = stored<Period>('bs.period', 'month')
    if (p === monthKey(new Date())) return 'month'
    // Старые сохранённые значения (например, «14 дней») — на «Этот месяц».
    return QUICK_PERIODS.some((q) => q.key === p) || /^\d{4}-\d{2}$/.test(p) ? p : 'month'
  })
  const range = useMemo(() => periodRange(period), [period])
  const months = useMemo(() => pastMonths(), [])
  const pastMonth = /^\d{4}-\d{2}$/.test(period)
  const [platform, setPlatform] = useState<PlatformFilter>(() => stored<PlatformFilter>('bs.platform', 'all'))
  // Пустая строка — все приложения.
  const [app, setApp] = useState<string>(appFromUrl)
  const [tab, setTab] = useState<Tab>('revenue')
  const [data, setData] = useState<Dashboard | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [showDemo, setShowDemo] = useState(false)
  const [setup, setSetup] = useState<SourceName | null>(null)
  const [needLogin, setNeedLogin] = useState(false)

  // Время свежих цифр Яндекса — для подписи «обновлено N с назад»; меняется и тогда, когда цифры те же.
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const lastBody = useRef('')

  // silent — автообновление: без крутящейся кнопки, без перерисовки, если ничего не изменилось,
  // и без красной плашки при разовом сбое — на экране остаются прежние цифры.
  const load = useCallback(
    async (refresh = false, silent = false) => {
      if (!silent) {
        setLoading(true)
        setError(null)
      }
      try {
        const res = await fetch(`/api/dashboard?from=${range.from}&to=${range.to}${refresh ? '&refresh=1' : ''}`)
        const text = await res.text()
        const json = JSON.parse(text)
        if (res.status === 401 && json.error === 'login') {
          setNeedLogin(true)
          return
        }
        if (!res.ok) throw new Error(json.error || res.statusText)
        setNeedLogin(false)
        setUpdatedAt(json.generatedAt)
        const body = text.replace(/"generatedAt":"[^"]*"/, '')
        if (body !== lastBody.current) {
          lastBody.current = body
          setData(json)
        }
        setError(null)
      } catch (e) {
        if (!silent) setError(String((e as Error).message || e))
      } finally {
        if (!silent) setLoading(false)
      }
    },
    [range],
  )

  useEffect(() => {
    load()
  }, [load])

  const live = range.to === isoDate(new Date()) && !showDemo && !needLogin
  useEffect(() => {
    if (!live) return
    const visible = () => document.visibilityState === 'visible'
    const id = window.setInterval(() => visible() && load(false, true), AUTO_REFRESH_MS)
    // Вернулись на вкладку после перерыва — сразу подтягиваем свежее.
    const onShow = () => visible() && load(false, true)
    document.addEventListener('visibilitychange', onShow)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onShow)
    }
  }, [live, load])

  useEffect(() => {
    const onBack = () => {
      setApp(appFromUrl())
      setTab('revenue')
    }
    window.addEventListener('popstate', onBack)
    return () => window.removeEventListener('popstate', onBack)
  }, [])

  async function logout() {
    await fetch('/api/logout', { method: 'POST' }).catch(() => {})
    lastBody.current = ''
    setData(null)
    setNeedLogin(true)
  }

  function choosePeriod(p: Period) {
    if (!p) return
    setPeriod(p)
    remember('bs.period', p)
  }

  function openApp(name: string) {
    if (name !== app) window.history.pushState(null, '', name ? '#app=' + encodeURIComponent(name) : window.location.pathname)
    setApp(name)
    setTab('revenue')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const nothingConnected = data ? Object.values(data.sources).every((s) => !s.configured) : false
  const view = showDemo ? demoDashboard(range.from, range.to) : data
  const rows = useMemo(() => (view ? view.ads.filter((r) => platform === 'all' || r.platform === platform) : []), [view, platform])
  const appRows = useMemo(() => (app ? rows.filter((r) => r.app === app) : rows), [rows, app])
  const geo = useMemo(() => (view?.geo ?? []).filter((r) => (platform === 'all' || r.platform === platform) && (!app || r.app === app)), [view, platform, app])
  const appsByRevenue = useMemo(() => {
    if (!view) return []
    const revenue = (name: string) =>
      sum(
        view.ads.filter((r) => r.app === name),
        (r) => r.revenue,
      )
    return [...view.apps].sort((a, b) => revenue(b.name) - revenue(a.name))
  }, [view])
  const info = view?.apps.find((a) => a.name === app)
  const appPlayers = app ? view?.players?.[app] : undefined
  const appOnline = app ? view?.online?.[app] : undefined
  const onlineTotal = view?.online ? Object.values(view.online).reduce((a, o) => a + o.now, 0) : null

  if (needLogin)
    return (
      <Login
        onDone={() => {
          setNeedLogin(false)
          load(true)
        }}
      />
    )

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <img src="/bottle.svg" alt="" width={40} height={40} />
          <div>
            <h1>Доход приложений</h1>
            <p className="muted">Яндекс · VK · Unity Ads — все игры в одном месте</p>
          </div>
        </div>
        <div className="controls">
          <select className="select" value={app} onChange={(e) => openApp(e.target.value)} aria-label="Приложение">
            <option value="">Все приложения</option>
            {appsByRevenue.map((a) => (
              <option key={a.name} value={a.name}>
                {a.name}
              </option>
            ))}
            {app && !info && <option value={app}>{app}</option>}
          </select>
          <div className="seg">
            {(['all', 'Android', 'iOS'] as PlatformFilter[]).map((p) => (
              <button
                key={p}
                className={p === platform ? 'on' : ''}
                onClick={() => {
                  setPlatform(p)
                  remember('bs.platform', p)
                }}
              >
                {p === 'all' ? 'Все' : p}
              </button>
            ))}
          </div>
          <button className="icon-btn" onClick={() => load(true)} disabled={loading || showDemo} title="Обновить">
            <RefreshCw size={18} className={loading ? 'spin' : ''} />
          </button>
          {data?.auth && (
            <button className="icon-btn" onClick={logout} title="Выйти">
              <LogOut size={18} />
            </button>
          )}
        </div>
      </header>

      <div className="periods">
        <div className="seg seg-wrap">
          {QUICK_PERIODS.map((p) => (
            <button key={p.key} className={p.key === period ? 'on' : ''} onClick={() => choosePeriod(p.key)}>
              {p.label}
            </button>
          ))}
        </div>
        <select className={'select' + (pastMonth ? ' on' : '')} value={pastMonth ? period : ''} onChange={(e) => choosePeriod(e.target.value)} aria-label="Другой месяц">
          {!pastMonth && <option value="">Другой месяц…</option>}
          {months.map((m) => (
            <option key={m} value={m}>
              {monthName(m)}
            </option>
          ))}
        </select>
      </div>

      {view && <SourceBar data={view} onSetup={setSetup} />}

      {error && <div className="banner error-banner">Не удалось загрузить данные: {error}</div>}

      {showDemo && (
        <div className="banner demo-banner">
          <Sparkles size={18} />
          <span>
            <b>Это пример</b>, а не ваши данные — так сайт будет выглядеть после подключения ключей.
          </span>
          <button className="link" onClick={() => setShowDemo(false)}>
            Вернуться к своим данным
          </button>
        </div>
      )}

      {data && nothingConnected && !showDemo && (
        <div className="welcome">
          <Gamepad2 size={40} />
          <h2>Подключите источники данных</h2>
          <p className="muted">
            Нажмите на любой источник выше — там пошаговая инструкция. Ключи хранятся в файле <code>.env</code> на этом компьютере и никуда не отправляются.
          </p>
          <button className="btn" onClick={() => setShowDemo(true)}>
            Показать пример, как это будет выглядеть
          </button>
        </div>
      )}

      {view && !(nothingConnected && !showDemo) && (
        <main>
          <p className="range muted">
            {view.range.from === view.range.to ? longDate(view.range.from) : `${longDate(view.range.from)} — ${longDate(view.range.to)}`}
            {!showDemo && view.generatedAt && (live ? <LiveBadge at={updatedAt ?? view.generatedAt} /> : <> · обновлено {clock(view.generatedAt)}</>)}
            {onlineTotal != null && !app && <OnlineChip n={onlineTotal} />}
          </p>

          {!app ? (
            <>
              <RevenueKpis data={view} rows={rows} view={`all|${platform}`} />
              <Assistant alerts={view.alerts} onOpenApp={openApp} />
              <AppsTable apps={view.apps} rows={rows} players={view.players} online={view.online} onOpen={openApp} />
              <RevenueCharts data={view} rows={rows} />
              <CountriesTable rows={geo} />
              <NetworkFormatTable rows={rows} />
            </>
          ) : (
            <>
              <div className="app-head">
                <button className="back" onClick={() => openApp('')}>
                  <ArrowLeft size={16} /> Все приложения
                </button>
                <AppIcon name={app} src={info?.iconLarge ?? info?.icon} size={52} />
                <div className="app-title">
                  <h2>
                    {app} {appOnline && <OnlineChip n={appOnline.now} />}
                  </h2>
                  <div className="badges">
                    {info?.platforms.map((p) => (
                      <span key={p} className="badge">
                        {p}
                      </span>
                    ))}
                    {info?.networks.map((n) => (
                      <span key={n} className="badge">
                        <span className="dot" style={{ background: NETWORKS[n].color }} /> {NETWORKS[n].name}
                      </span>
                    ))}
                  </div>
                </div>
                {info?.firebase && (
                  <div className="seg tabs">
                    <button className={tab === 'revenue' ? 'on' : ''} onClick={() => setTab('revenue')}>
                      Доход
                    </button>
                    <button className={tab === 'players' ? 'on' : ''} onClick={() => setTab('players')}>
                      Игроки
                    </button>
                  </div>
                )}
              </div>

              {tab === 'revenue' || !info?.firebase ? (
                <>
                  <RevenueKpis data={view} rows={appRows} view={`${app}|${platform}`} />
                  {view.alerts.some((a) => a.app === app) && <Assistant alerts={view.alerts.filter((a) => a.app === app)} />}
                  <RevenueCharts data={view} rows={appRows} />
                  <CountriesTable rows={geo} />
                  <NetworkFormatTable rows={appRows} open />
                </>
              ) : (
                <>
                  <SectionTitle icon={<Users size={20} />} title="Игроки" hint="Firebase Analytics" />
                  {appPlayers ? (
                    <PlayersSection players={appPlayers} />
                  ) : (
                    <Empty>Нет данных Firebase по этой игре — проверьте номер ga4 в apps.json и доступ сервисного аккаунта.</Empty>
                  )}

                  <SectionTitle icon={<Flag size={20} />} title="Уровни" hint="Где игроки застревают и уходят" />
                  {appPlayers ? <LevelsSection players={appPlayers} /> : <Empty>Появится после подключения Firebase.</Empty>}

                  <SectionTitle icon={<BarChart3 size={20} />} title="Реклама глазами игроков" hint="Какие кнопки «за рекламу» нажимают и выходит ли межстраничная" />
                  {appPlayers ? <BehaviorSection players={appPlayers} /> : <Empty>Появится после подключения Firebase.</Empty>}
                </>
              )}
            </>
          )}
        </main>
      )}

      {!view && !error && <div className="loading">Загружаю…</div>}

      {setup && view && (
        <SetupPanel
          source={setup}
          data={view}
          onClose={() => setSetup(null)}
          onSaved={async () => {
            setShowDemo(false)
            await load(true)
          }}
        />
      )}
    </div>
  )
}
