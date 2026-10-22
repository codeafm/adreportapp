// Функция Vercel: тот же обработчик /api, что у локального сайта (server/api.mjs).
import { createApi } from '../server/api.mjs'

const handle = createApi(process.env, process.cwd())

export default async function handler(req, res) {
  if (!(await handle(req, res))) res.status(404).end()
}
