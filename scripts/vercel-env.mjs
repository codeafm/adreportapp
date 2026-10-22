// Переносит ключи с этого компьютера в Vercel и перевыкладывает сайт. Запуск: npm run vercel:env
// Берёт ключи сетей из .env и JSON-ключ Google из secrets/, спрашивает email и пароль для входа на сайт.
// Значения уходят в Vercel через stdin (не в командной строке) и сохраняются там как секретные.
// npm run vercel:env -- --dry — только показать, что будет загружено (имена и длины, без значений).
import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dry = process.argv.includes('--dry')
const win = process.platform === 'win32'

function readEnv(file) {
  const out = {}
  if (!fs.existsSync(file)) return out
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
    if (m) out[m[1]] = m[2].trim().replace(/^"(.*)"$/, '$1')
  }
  return out
}

function ask(question, hidden = false) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true })
    // Пароль не показываем: вместо символов — звёздочки.
    if (hidden) rl._writeToOutput = (s) => rl.output.write(s.startsWith(question) ? question : s.replace(/[^\r\n]/g, '*'))
    rl.question(question, (answer) => {
      rl.close()
      if (hidden) process.stdout.write('\n')
      resolve(answer.trim())
    })
  })
}

function vercel(args, input) {
  const r = spawnSync('vercel', args, { cwd: root, input, encoding: 'utf8', shell: win })
  return { ok: r.status === 0, out: `${r.stdout ?? ''}${r.stderr ?? ''}` }
}

const env = readEnv(path.join(root, '.env'))
const project = JSON.parse(fs.readFileSync(path.join(root, '.vercel', 'project.json'), 'utf8')).projectName
console.log(`Проект Vercel: ${project} (https://${project}.vercel.app)\n`)

const vars = {}
for (const name of ['YANDEX_OAUTH_TOKEN', 'VK_TOKEN', 'UNITY_API_KEY', 'UNITY_ORG_ID']) if (env[name]) vars[name] = env[name]
const keyFile = path.resolve(root, env.GOOGLE_APPLICATION_CREDENTIALS || './secrets/ga-service-account.json')
// JSON-ключ — в base64: в нём переносы строк, а так значение одной строкой. Сервер понимает оба вида.
if (fs.existsSync(keyFile)) vars.GA_SERVICE_ACCOUNT_JSON = Buffer.from(fs.readFileSync(keyFile, 'utf8')).toString('base64')

if (dry) {
  vars.DASHBOARD_EMAIL = '(спросит)'
  vars.DASHBOARD_PASSWORD = '(спросит)'
} else {
  vars.DASHBOARD_EMAIL = (await ask(`Email для входа на сайт${env.DASHBOARD_EMAIL ? ` [${env.DASHBOARD_EMAIL}]` : ''}: `)) || env.DASHBOARD_EMAIL || ''
  if (!vars.DASHBOARD_EMAIL.includes('@')) throw new Error('Нужен email')
  for (;;) {
    const p1 = await ask('Пароль для входа (не виден при вводе): ', true)
    const p2 = await ask('Ещё раз: ', true)
    if (!p1 || p1 !== p2) {
      console.log('Пароли не совпали, ещё раз.\n')
      continue
    }
    if (p1.length < 12 && !/^(д|да|y|yes)$/i.test(await ask('Пароль короче 12 символов — его легко подобрать. Всё равно оставить? (д/н): '))) continue
    vars.DASHBOARD_PASSWORD = p1
    break
  }
}

console.log('\nЗагружаю в Vercel (Production):')
for (const [name, value] of Object.entries(vars)) {
  if (dry) {
    console.log(`  ${name.padEnd(24)} ${value.startsWith('(') ? value : value.length + ' символов'}`)
    continue
  }
  const r = vercel(['env', 'add', name, 'production', '--force', '--sensitive', '--yes'], value)
  console.log(`  ${r.ok ? '✓' : '✗'} ${name}${r.ok ? '' : '\n' + r.out.slice(-400)}`)
  if (!r.ok) process.exit(1)
}
if (dry) process.exit(0)

console.log('\nВыкладываю сайт с новыми переменными — около минуты…')
const deploy = vercel(['deploy', '--prod', '--yes'])
if (!deploy.ok) {
  console.log(deploy.out.slice(-800))
  process.exit(1)
}

// Готово, если сайт просит войти (401), а не говорит, что пароль не задан (503).
const res = await fetch(`https://${project}.vercel.app/api/dashboard?days=1`)
console.log(res.status === 401 ? `\nГотово. Откройте https://${project}.vercel.app и войдите.` : `\nСайт ответил ${res.status}: ${(await res.text()).slice(0, 200)}`)
