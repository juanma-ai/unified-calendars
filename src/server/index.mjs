import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { resolve, extname, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createFamilyAggregator } from '../main/sourceRegistry.js'
import { createCalendarApi } from './calendarApi.mjs'

const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' }
export function createWebServer({ auth, api = createCalendarApi(createFamilyAggregator()), publicUrl, staticDir = resolve('dist/web') }) {
  const origin = new URL(publicUrl).origin
  return createServer({ requestTimeout: 20000 }, async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Referrer-Policy', 'same-origin')
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'")
    try {
      const url = new URL(req.url, origin)
      if (url.pathname === '/healthz' && req.method === 'GET') { res.end('ok'); return }
      if (!(await auth(req, res, url))) return
      if (url.pathname.startsWith('/api/')) {
        if (req.method !== 'POST') throw Object.assign(new Error('Method not allowed'), { status: 405 })
        if (req.headers.origin !== origin || !req.headers['content-type']?.startsWith('application/json')) throw Object.assign(new Error('Invalid origin or content type'), { status: 403 })
        let body = ''
        for await (const chunk of req) {
          body += chunk
          if (Buffer.byteLength(body) > 16384) throw Object.assign(new Error('Request too large'), { status: 413 })
        }
        let args
        try { args = JSON.parse(body) } catch { throw Object.assign(new Error('Invalid JSON'), { status: 400 }) }
        const result = await api(url.pathname.slice(5), args)
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify(result ?? null)); return
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') throw Object.assign(new Error('Method not allowed'), { status: 405 })
      const relative = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname).slice(1)
      const file = resolve(staticDir, relative)
      if (!file.startsWith(resolve(staticDir) + sep)) throw Object.assign(new Error('Not found'), { status: 404 })
      let content
      try { content = await readFile(file) } catch { throw Object.assign(new Error('Not found'), { status: 404 }) }
      res.setHeader('Content-Type', mime[extname(file)] || 'application/octet-stream')
      res.end(req.method === 'HEAD' ? undefined : content)
    } catch (error) {
      res.statusCode = error.status || 500
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: error.status ? error.message : 'Calendar request failed' }))
    }
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { createAuth } = await import('./auth.mjs')
  const publicUrl = process.env.WEB_PUBLIC_URL
  const auth = await createAuth(process.env)
  createWebServer({ auth, publicUrl }).listen(Number(process.env.PORT || 3000), '0.0.0.0', () => console.log('Family calendar listening'))
}
