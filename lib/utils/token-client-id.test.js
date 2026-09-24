import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getTokenClientId } from './token-client-id.js'

/**
 * @param {Record<string, unknown>} claims
 */
function makeToken (claims) {
  const encode = (/** @type {unknown} */ value) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg: 'RS256' })}.${encode(claims)}.signature`
}

test('getTokenClientId reads the azp claim', () => {
  assert.equal(getTokenClientId(makeToken({ azp: 'tpc_new', exp: 1 })), 'tpc_new')
})

test('getTokenClientId returns undefined for tokens it cannot read', () => {
  assert.equal(getTokenClientId(makeToken({ sub: 'user' })), undefined)
  assert.equal(getTokenClientId('not-a-jwt'), undefined)
  assert.equal(getTokenClientId('a.%%%.c'), undefined)
  assert.equal(getTokenClientId(undefined), undefined)
})
