/** @import { YotoClient } from 'yoto-nodejs-client' */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isMissingScopeError, tolerateMissingStatusScope } from './status-scope-fallback.js'

const scopeError = Object.assign(new Error('Unexpected response status code'), {
  statusCode: 403,
  jsonBody: { error: { code: 'forbidden', message: "User does not have required scope(s): 'family:device-status:view'" } },
})

/**
 * @param {() => Promise<unknown>} impl
 */
function fakeClient (impl) {
  return /** @type {YotoClient} */ (/** @type {unknown} */ ({ getDeviceStatus: impl }))
}

test('isMissingScopeError only matches 403 scope errors', () => {
  assert.equal(isMissingScopeError(scopeError), true)
  assert.equal(isMissingScopeError(Object.assign(new Error('x'), { statusCode: 403, jsonBody: { error: { code: 'forbidden', message: 'Access to card forbidden.' } } })), false)
  assert.equal(isMissingScopeError(Object.assign(new Error('x'), { statusCode: 500 })), false)
  assert.equal(isMissingScopeError(null), false)
})

test('returns an empty status response on a missing-scope error and logs once', async () => {
  /** @type {string[]} */
  const logs = []
  const client = fakeClient(async () => { throw scopeError })
  tolerateMissingStatusScope(client, (message) => logs.push(message))

  assert.deepEqual(await client.getDeviceStatus({ deviceId: 'dev-1' }), { deviceId: 'dev-1' })
  await client.getDeviceStatus({ deviceId: 'dev-2' })
  assert.equal(logs.length, 1)
})

test('passes through successful responses and other errors', async () => {
  const ok = fakeClient(async () => ({ deviceId: 'dev-1', batteryLevel: 50 }))
  tolerateMissingStatusScope(ok, () => {})
  assert.deepEqual(await ok.getDeviceStatus({ deviceId: 'dev-1' }), { deviceId: 'dev-1', batteryLevel: 50 })

  const failing = fakeClient(async () => { throw Object.assign(new Error('boom'), { statusCode: 500 }) })
  tolerateMissingStatusScope(failing, () => {})
  await assert.rejects(failing.getDeviceStatus({ deviceId: 'dev-1' }), /boom/)
})
