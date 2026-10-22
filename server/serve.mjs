// Готовая сборка (npm run build) без Vite: отдаёт dist и /api. Запуск: npm start
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApi } from './api.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
try {
  process.loadEnvFile(path.join(root, '.env'))
} catch {
  console.warn('Нет файла .env — источники данных не подключены (см. README.md)')
}

const api = createApi(process.env, root)
const dist = path.join(root, 'dist')
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' }
const port = Number(process.env.PORT || 4173)

http
  .createServer(async (req, res) => {
    if (await api(req, res)) return
    const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
    let file = path.join(dist, urlPath)
    if (!file.startsWith(dist) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(dist, 'index.html')
    res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream')
    fs.createReadStream(file).pipe(res)
  })
  .listen(port, () => console.log(`Статистика Bottle Sort: http://localhost:${port}`))
