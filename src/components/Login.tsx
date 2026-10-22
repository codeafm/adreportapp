import { useState } from 'react'
import { LockKeyhole } from 'lucide-react'

// Вход владельца. Email и пароль проверяет сервер (DASHBOARD_EMAIL и DASHBOARD_PASSWORD) — в браузере их нет.
export function Login({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || res.statusText)
      setPassword('')
      onDone()
    } catch (err) {
      setError(String((err as Error).message || err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-wrap">
      <form className="login card" onSubmit={submit}>
        <div className="login-icon">
          <LockKeyhole size={22} />
        </div>
        <h2>Вход</h2>
        <p className="muted small">Доход приложений — только для владельца</p>
        <label className="field">
          <span>Email</span>
          <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </label>
        <label className="field">
          <span>Пароль</span>
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        <button className="btn" type="submit" disabled={busy}>
          {busy ? 'Проверяю…' : 'Войти'}
        </button>
        {error && <p className="error-text">{error}</p>}
      </form>
    </div>
  )
}
