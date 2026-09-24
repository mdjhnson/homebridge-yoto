/**
 * Tests for platform startup: staying idle until configured, surviving bad
 * saved logins, and retrying when Yoto can't be reached.
 */

/** @import { API, Logger, PlatformConfig } from 'homebridge' */
/** @import { YotoAccount } from 'yoto-nodejs-client' */

import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import * as hap from '@homebridge/hap-nodejs'
import { YotoPlatform } from './platform.js'
import { ListenerGroup, logListenerError } from './utils/listener-group.js'

/** @type {string[]} */
let logs = []

const noop = () => {}

function makeLog () {
  logs = []
  const log = {
    debug: noop,
    info: noop,
    success: noop,
    warn: (/** @type {unknown[]} */ ...args) => { logs.push(`warn: ${args.join(' ')}`) },
    error: (/** @type {unknown[]} */ ...args) => { logs.push(`error: ${args.join(' ')}`) },
    log: noop,
  }
  return /** @type {Logger} */ (/** @type {unknown} */ (log))
}

function makeApi () {
  /** @type {string[]} */
  const events = []
  const api = {
    hap,
    events,
    on: (/** @type {string} */ event) => { events.push(event) },
    user: { configPath: () => '/nonexistent/config.json' },
    registerPlatformAccessories: noop,
    updatePlatformAccessories: noop,
    unregisterPlatformAccessories: noop,
    publishExternalAccessories: noop,
  }
  return { api: /** @type {API} */ (/** @type {unknown} */ (api)), events }
}

/**
 * An unsigned JWT with an exp claim, enough for the client to accept it.
 * @param {Record<string, unknown>} [claims]
 * @returns {string}
 */
function makeAccessToken (claims = {}) {
  /** @param {object} value */
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg: 'none' })}.${encode({ exp: Math.floor(Date.now() / 1000) + 3600, ...claims })}.sig`
}

/**
 * @param {Record<string, unknown>} [extra]
 * @returns {PlatformConfig}
 */
function makeConfig (extra = {}) {
  return { platform: 'Yoto', accessToken: makeAccessToken(), refreshToken: 'refresh', ...extra }
}

/**
 * Stand-in for YotoAccount whose start() fails a set number of times.
 */
class FakeAccount extends EventEmitter {
  /** @type {Map<string, unknown>} */ devices = new Map()
  startCalls = 0
  stopCalls = 0
  running = false
  /** @type {() => Error} */ makeError = () => new Error('getaddrinfo ENOTFOUND api.yotoplay.com')
  /** @type {Promise<void> | null} */ startGate = null

  /** @param {number} failures */
  constructor (failures) {
    super()
    this.failures = failures
  }

  async start () {
    this.startCalls++
    if (this.startGate) await this.startGate
    if (this.failures > 0) {
      this.failures--
      throw this.makeError()
    }
    this.running = true
  }

  async stop () {
    this.stopCalls++
    // Like YotoAccount, stopping before start() finishes does nothing
    this.running = false
  }

  /** @returns {undefined} */
  getDevice () { return undefined }

  /** @returns {string[]} */
  getDeviceIds () { return [] }
}

/**
 * @param {YotoPlatform} platform
 * @param {FakeAccount} fake
 */
function useFakeAccount (platform, fake) {
  const account = /** @type {YotoAccount} */ (/** @type {unknown} */ (fake))
  platform.yotoAccount = account
  platform.accountListeners = new ListenerGroup(account, logListenerError(platform.log, '[Platform]'))
}

const flush = () => new Promise(resolve => setImmediate(resolve))

/**
 * An error shaped like the client's YotoAPIError.
 * @param {number} statusCode
 * @returns {Error}
 */
function makeApiError (statusCode) {
  return Object.assign(new Error('Unexpected response status code'), {
    statusCode,
    jsonBody: { error: 'insufficient_scope' },
  })
}

test('does not start until the plugin is signed in', () => {
  const { api, events } = makeApi()
  const platform = new YotoPlatform(makeLog(), { platform: 'Yoto' }, api)

  assert.equal(platform.yotoAccount, null)
  assert.deepEqual(events, [], 'no launch or shutdown handlers are registered')
  assert.ok(logs.some(line => line.startsWith('warn:') && line.includes('Homebridge UI')))
})

test('a malformed saved access token is logged instead of crashing Homebridge', () => {
  const { api, events } = makeApi()
  /** @type {YotoPlatform | undefined} */
  let platform
  assert.doesNotThrow(() => {
    platform = new YotoPlatform(makeLog(), makeConfig({ accessToken: 'not-a-jwt' }), api)
  })

  assert.equal(platform?.yotoAccount, null)
  assert.deepEqual(events, [])
  assert.ok(logs.some(line => line.startsWith('error:') && line.includes('sign in again')))
})

test('refreshes with the client ID the saved login was issued to, not a stale configured one', () => {
  const { api } = makeApi()
  const log = makeLog()
  /** @type {string[]} */
  const infos = []
  log.info = (/** @type {unknown[]} */ ...args) => { infos.push(args.join(' ')) }
  const platform = new YotoPlatform(log, makeConfig({
    clientId: 'Y4HJ8BFqRQ24GQoLzgOzZ2KSqWmFG8LI',
    accessToken: makeAccessToken({ azp: 'tpc_ot5BY24FLyZoCX9MnykipB' }),
  }), api)

  assert.ok(platform.yotoAccount)
  assert.ok(infos.some(line => line.includes('(tpc_ot5BY24FLyZoCX9MnykipB) instead of the one in the settings (Y4HJ8BFqRQ24GQoLzgOzZ2KSqWmFG8LI)')))
})

test('uses newer tokens from config.json when Homebridge passes a stale copy', () => {
  const { api } = makeApi()
  const dir = mkdtempSync(join(tmpdir(), 'yoto-config-'))
  const configPath = join(dir, 'config.json')
  const newer = { accessToken: makeAccessToken(), refreshToken: 'rotated', tokenExpiresAt: Date.now() + 86400000 }
  writeFileSync(configPath, JSON.stringify({
    platforms: [{ platform: 'Yoto', _bridge: { username: 'AA:BB' }, ...newer }],
  }))
  api.user.configPath = () => configPath

  const config = makeConfig({ refreshToken: 'already-used', tokenExpiresAt: Date.now() - 1000, _bridge: { username: 'AA:BB' } })
  const platform = new YotoPlatform(makeLog(), config, api)

  assert.ok(platform.yotoAccount)
  assert.equal(config['refreshToken'], 'rotated')
  assert.equal(config['accessToken'], newer.accessToken)
})

test('retries starting the account with backoff when Yoto is unreachable', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const { api } = makeApi()
  const platform = new YotoPlatform(makeLog(), makeConfig(), api)
  const fake = new FakeAccount(2)
  useFakeAccount(platform, fake)

  await platform.startAccount()
  assert.equal(fake.startCalls, 1)
  assert.ok(logs.some(line => line.includes('Retrying in 30 seconds')))

  t.mock.timers.tick(30 * 1000)
  await flush()
  assert.equal(fake.startCalls, 2)
  assert.ok(logs.some(line => line.includes('Retrying in 60 seconds')), 'the delay doubles')

  t.mock.timers.tick(60 * 1000)
  await flush()
  assert.equal(fake.startCalls, 3)
  assert.equal(platform.startRetryTimer, null, 'no retry is pending once started')
  assert.equal(platform.startRetryCount, 0)
})

test('does not retry once the login is known to be invalid', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const { api } = makeApi()
  const platform = new YotoPlatform(makeLog(), makeConfig(), api)
  const fake = new FakeAccount(1)
  useFakeAccount(platform, fake)
  platform.authInvalid = true

  await platform.startAccount()

  assert.equal(platform.startRetryTimer, null)
  assert.ok(logs.some(line => line.startsWith('error:') && line.includes('Failed to start account')))
})

test('shutdown cancels a pending startup retry', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const { api } = makeApi()
  const platform = new YotoPlatform(makeLog(), makeConfig(), api)
  const fake = new FakeAccount(5)
  useFakeAccount(platform, fake)

  await platform.startAccount()
  assert.notEqual(platform.startRetryTimer, null)

  await platform.shutdown()
  t.mock.timers.tick(10 * 60 * 1000)
  await flush()

  assert.equal(platform.startRetryTimer, null)
  assert.equal(fake.startCalls, 1)
})

test('errors while registering a discovered device are logged, not thrown', async () => {
  const { api } = makeApi()
  const platform = new YotoPlatform(makeLog(), makeConfig(), api)
  const fake = new FakeAccount(0)
  const model = { device: { deviceId: 'dev-1', name: 'Kitchen Yoto' } }
  fake.getDevice = () => /** @type {undefined} */ (/** @type {unknown} */ (model))
  platform.registerDevice = async () => { throw new Error('model exploded') }
  useFakeAccount(platform, fake)

  await platform.startAccount()
  fake.emit('deviceAdded', { deviceId: 'dev-1' })
  await flush()

  assert.ok(logs.some(line => line.startsWith('error:') && line.includes('model exploded')))
})

test('a rejected login is reported once instead of retried', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const { api } = makeApi()
  const platform = new YotoPlatform(makeLog(), makeConfig(), api)
  const fake = new FakeAccount(5)
  fake.makeError = () => makeApiError(403)
  useFakeAccount(platform, fake)

  await platform.startAccount()
  t.mock.timers.tick(10 * 60 * 1000)
  await flush()

  assert.equal(fake.startCalls, 1)
  assert.equal(platform.startRetryTimer, null)
  const line = logs.find(entry => entry.startsWith('error:') && entry.includes('HTTP 403'))
  assert.ok(line?.includes('sign in again'))
  assert.ok(line?.includes('insufficient_scope'), 'the response body is logged')
})

test('other 4xx responses are not retried', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const { api } = makeApi()
  const platform = new YotoPlatform(makeLog(), makeConfig(), api)
  const fake = new FakeAccount(5)
  fake.makeError = () => makeApiError(404)
  useFakeAccount(platform, fake)

  await platform.startAccount()

  assert.equal(platform.startRetryTimer, null)
  assert.ok(logs.some(line => line.startsWith('error:') && line.includes('Failed to start account')))
})

test('5xx and 429 responses are retried, with the status in the log', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const { api } = makeApi()
  const platform = new YotoPlatform(makeLog(), makeConfig(), api)
  const fake = new FakeAccount(2)
  const statuses = [503, 429]
  fake.makeError = () => makeApiError(statuses.shift() ?? 500)
  useFakeAccount(platform, fake)

  await platform.startAccount()
  assert.ok(logs.some(line => line.startsWith('warn:') && line.includes('HTTP 503')))

  t.mock.timers.tick(30 * 1000)
  await flush()
  assert.ok(logs.some(line => line.startsWith('warn:') && line.includes('HTTP 429')))

  t.mock.timers.tick(60 * 1000)
  await flush()
  assert.equal(fake.startCalls, 3)
  assert.ok(fake.running)
})

test('an account start that finishes after shutdown is stopped again', async () => {
  const { api } = makeApi()
  const platform = new YotoPlatform(makeLog(), makeConfig(), api)
  const fake = new FakeAccount(0)
  /** @type {() => void} */
  let release = noop
  fake.startGate = new Promise(resolve => { release = resolve })
  useFakeAccount(platform, fake)

  const starting = platform.startAccount()
  await flush()
  await platform.shutdown()
  assert.equal(fake.stopCalls, 1)

  release()
  await starting

  assert.equal(fake.running, false, 'what start() opened is stopped')
  assert.equal(fake.stopCalls, 2)
})

test('an account start that fails after shutdown does not schedule a retry', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const { api } = makeApi()
  const platform = new YotoPlatform(makeLog(), makeConfig(), api)
  const fake = new FakeAccount(1)
  /** @type {() => void} */
  let release = noop
  fake.startGate = new Promise(resolve => { release = resolve })
  useFakeAccount(platform, fake)

  const starting = platform.startAccount()
  await flush()
  await platform.shutdown()
  release()
  await starting

  assert.equal(platform.startRetryTimer, null)
})

test('a throwing account-level listener is logged instead of escaping', async () => {
  const { api } = makeApi()
  const platform = new YotoPlatform(makeLog(), makeConfig(), api)
  const fake = new FakeAccount(0)
  useFakeAccount(platform, fake)
  platform.removeStaleAccessories = () => { throw new Error('unregister exploded') }

  await platform.startAccount()
  logs = []
  assert.doesNotThrow(() => fake.emit('deviceRemoved', { deviceId: 'dev-1' }))

  assert.ok(logs.some(line => line.startsWith('error:') && line.includes('deviceRemoved') && line.includes('unregister exploded')))
})
