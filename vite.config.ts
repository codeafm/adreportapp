import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
// @ts-expect-error — серверный модуль на JS, общий для Vite и serve.mjs
import { createApi } from './server/api.mjs'

// /api отвечает прямо из dev-сервера Vite: ключи из .env остаются на компьютере и не уходят в браузер.
function statsApi(env: Record<string, string>): Plugin {
  return {
    name: 'bottle-sort-stats-api',
    configureServer(server) {
      const handle = createApi(env, process.cwd())
      server.middlewares.use(async (req, res, next) => {
        if (!(await handle(req, res))) next()
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), statsApi(env)],
    server: { port: 5180, open: false },
    build: { chunkSizeWarningLimit: 900 },
  }
})
