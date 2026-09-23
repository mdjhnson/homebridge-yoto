import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createOAuthState, createPkcePair, parseAuthorizationResponse } from './oauth.js'

test('createPkcePair returns an S256 challenge for the verifier', () => {
  const { codeVerifier, codeChallenge } = createPkcePair()
  assert.match(codeVerifier, /^[A-Za-z0-9_-]{43}$/)
  assert.equal(codeChallenge, createHash('sha256').update(codeVerifier).digest('base64url'))
  assert.notEqual(createPkcePair().codeVerifier, codeVerifier)
})

test('createOAuthState returns random url-safe values', () => {
  const state = createOAuthState()
  assert.match(state, /^[A-Za-z0-9_-]+$/)
  assert.notEqual(createOAuthState(), state)
})

test('parses the full redirect URL', () => {
  assert.deepEqual(
    parseAuthorizationResponse('  http://127.0.0.1:8787/callback?code=abc123&state=xyz  '),
    { code: 'abc123', state: 'xyz' }
  )
})

test('parses a bare query string or URL without a scheme', () => {
  assert.deepEqual(parseAuthorizationResponse('?code=abc&state=s'), { code: 'abc', state: 's' })
  assert.deepEqual(parseAuthorizationResponse('127.0.0.1:8787/callback?code=abc&state=s'), { code: 'abc', state: 's' })
})

test('treats other input as a bare code', () => {
  assert.deepEqual(parseAuthorizationResponse('abc123'), { code: 'abc123' })
  assert.deepEqual(parseAuthorizationResponse('   '), {})
})

test('returns OAuth errors', () => {
  assert.deepEqual(
    parseAuthorizationResponse('http://127.0.0.1:8787/callback?error=access_denied&error_description=User%20cancelled&state=s'),
    { error: 'access_denied', errorDescription: 'User cancelled', state: 's' }
  )
})
