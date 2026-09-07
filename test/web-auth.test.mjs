import test from 'node:test'
import assert from 'node:assert/strict'
import { createAuth } from '../src/server/auth.mjs'
const env = { WEB_PUBLIC_URL: 'https://family.test', OIDC_ISSUER: 'https://identity.test', OIDC_CLIENT_ID: 'id', OIDC_CLIENT_SECRET: 'secret', WEB_ALLOWED_SUBJECTS: 'family-sub' }
function response() { return { headers: {}, setHeader(k, v) { this.headers[k] = v }, writeHead(status, headers) { this.status = status; Object.assign(this.headers, headers) }, end() {} } }
test('requires configuration and HTTPS', async () => {
  await assert.rejects(createAuth({}), /Missing/)
  await assert.rejects(createAuth({ ...env, WEB_PUBLIC_URL: 'http://family.test' }), /HTTPS/)
})
test('login binds PKCE, state, nonce, family identity and expiring secure session', async () => {
  let time = 0, subject = 'family-sub', checks
  const oidc = {
    discovery: async () => ({}), randomState: () => 'state', randomPKCECodeVerifier: () => 'verifier',
    calculatePKCECodeChallenge: async () => 'challenge', buildAuthorizationUrl: (_, params) => new URL('https://identity.test/authorize?' + new URLSearchParams(params)),
    authorizationCodeGrant: async (_, url, received) => { checks = received; return { claims: () => ({ sub: subject }) } }
  }
  const auth = await createAuth(env, { oidc, now: () => time })
  const login = response()
  await auth({ method: 'GET', headers: {} }, login, new URL('https://family.test/auth/login?returnTo=' + encodeURIComponent('/?view=day&date=2026-09-07')))
  assert.match(login.headers['Set-Cookie'], /HttpOnly; Secure; SameSite=Lax/)
  const callback = response(), loginCookie = login.headers['Set-Cookie'].split(';')[0]
  await auth({ method: 'GET', headers: { cookie: loginCookie } }, callback, new URL('https://family.test/auth/callback?code=code&state=state'))
  assert.equal(checks.expectedState, 'state'); assert.equal(checks.pkceCodeVerifier, 'verifier'); assert.ok(checks.expectedNonce)
  assert.equal(callback.headers.Location, '/?view=day&date=2026-09-07')
  const sessionCookie = callback.headers['Set-Cookie'][0].split(';')[0]
  assert.equal(await auth({ headers: { cookie: sessionCookie } }, response(), new URL('https://family.test/')), true)
  await assert.rejects(auth({ method: 'GET', headers: { cookie: loginCookie } }, response(), new URL('https://family.test/auth/callback')), { status: 401 })
  time = 13 * 3600000
  const expired = response(); assert.equal(await auth({ headers: { cookie: sessionCookie } }, expired, new URL('https://family.test/api/getSourceStatus')), false)
  assert.equal(expired.status, 401)
  subject = 'outsider'
  const outsider = response()
  await auth({ method: 'GET', headers: {} }, outsider, new URL('https://family.test/auth/login?returnTo=https://evil.test'))
  await assert.rejects(auth({ method: 'GET', headers: { cookie: outsider.headers['Set-Cookie'].split(';')[0] } }, response(), new URL('https://family.test/auth/callback')), { status: 403 })
})
