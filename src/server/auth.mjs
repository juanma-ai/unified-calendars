import * as client from 'openid-client'
import { randomBytes } from 'node:crypto'

const SESSION_COOKIE = '__Host-family-session'
const LOGIN_COOKIE = '__Host-family-login'
const token = () => randomBytes(32).toString('base64url')
const cookie = (name, value, seconds) => `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${seconds}`
const readCookie = (req, name) => (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith(`${name}=`))?.slice(name.length + 1)
const safeReturn = value => {
  try {
    const url = new URL(value || '/', 'https://family.invalid')
    return url.origin === 'https://family.invalid' && url.pathname === '/' ? '/' + url.search : '/'
  } catch { return '/' }
}

// Pocket ID's public issuer stays HTTPS; only server-to-server traffic uses
// the dedicated Docker backend network. Never follow an endpoint off the issuer.
export function createInternalOidcFetch(issuer, internalUrl, request = fetch) {
  const publicOrigin = new URL(issuer).origin
  const internalOrigin = new URL(internalUrl).origin
  return (input, options) => {
    const url = new URL(input)
    if (url.origin !== publicOrigin) throw new Error('Unexpected OIDC endpoint origin')
    return request(internalOrigin + url.pathname + url.search, { ...options, redirect: 'error' })
  }
}

export async function createAuth(env, { oidc = client, now = Date.now } = {}) {
  for (const key of ['WEB_PUBLIC_URL', 'OIDC_ISSUER', 'OIDC_CLIENT_ID', 'OIDC_CLIENT_SECRET', 'WEB_ALLOWED_SUBJECTS']) {
    if (!env[key]) throw new Error(`Missing ${key}`)
  }
  const publicUrl = new URL(env.WEB_PUBLIC_URL)
  if (publicUrl.protocol !== 'https:') throw new Error('WEB_PUBLIC_URL must use HTTPS')
  const allowed = new Set(env.WEB_ALLOWED_SUBJECTS.split(',').map(s => s.trim()).filter(Boolean))
  if (!allowed.size) throw new Error('No allowed family identities')
  const transport = env.OIDC_INTERNAL_URL ? { [oidc.customFetch]: createInternalOidcFetch(env.OIDC_ISSUER, env.OIDC_INTERNAL_URL) } : undefined
  const configuration = await oidc.discovery(new URL(env.OIDC_ISSUER), env.OIDC_CLIENT_ID, env.OIDC_CLIENT_SECRET, undefined, transport)
  const pending = new Map(), sessions = new Map()
  const redirect = (res, location) => { res.writeHead(302, { Location: location }); res.end(); return false }
  return async (req, res, url) => {
    for (const map of [pending, sessions]) for (const [key, value] of map) if (value.expires <= now()) map.delete(key)
    if (url.pathname === '/auth/login' && req.method === 'GET') {
      if (pending.size >= 1000) throw Object.assign(new Error('Please try again later'), { status: 429 })
      const id = token(), state = oidc.randomState(), nonce = token()
      const verifier = oidc.randomPKCECodeVerifier()
      const challenge = await oidc.calculatePKCECodeChallenge(verifier)
      pending.set(id, { state, nonce, verifier, returnTo: safeReturn(url.searchParams.get('returnTo')), expires: now() + 600000 })
      res.setHeader('Set-Cookie', cookie(LOGIN_COOKIE, id, 600))
      return redirect(res, oidc.buildAuthorizationUrl(configuration, {
        redirect_uri: new URL('/auth/callback', publicUrl).href,
        scope: 'openid profile email', state, nonce, code_challenge: challenge, code_challenge_method: 'S256'
      }).href)
    }
    if (url.pathname === '/auth/callback' && req.method === 'GET') {
      const id = readCookie(req, LOGIN_COOKIE), attempt = pending.get(id)
      pending.delete(id)
      if (!attempt) throw Object.assign(new Error('Login expired. Please sign in again.'), { status: 401 })
      let claims
      try {
        const tokens = await oidc.authorizationCodeGrant(configuration, url, {
          pkceCodeVerifier: attempt.verifier, expectedState: attempt.state, expectedNonce: attempt.nonce, idTokenExpected: true
        })
        claims = tokens.claims()
      } catch { throw Object.assign(new Error('Login could not be verified'), { status: 401 }) }
      if (!claims?.sub || !allowed.has(claims.sub)) throw Object.assign(new Error('This calendar is restricted to the family'), { status: 403 })
      const session = token()
      sessions.set(session, { sub: claims.sub, expires: now() + 12 * 3600000 })
      res.setHeader('Set-Cookie', [cookie(SESSION_COOKIE, session, 12 * 3600), cookie(LOGIN_COOKIE, '', 0)])
      return redirect(res, attempt.returnTo)
    }
    if (sessions.has(readCookie(req, SESSION_COOKIE))) return true
    if (url.pathname.startsWith('/api/')) {
      res.writeHead(401, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Sign in required' })); return false
    }
    return redirect(res, `/auth/login?returnTo=${encodeURIComponent(safeReturn(url.pathname + url.search))}`)
  }
}
