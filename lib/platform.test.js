/**
 * Tests for platform startup: staying idle until configured, surviving bad
 * saved logins, and retrying when Yoto can't be reached.
 */

/** @import { API, Logger, PlatformConfig } from 'homebridge' */
/** @import { YotoAccount } from 'yoto-nodejs-client' */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import * as hap from '@homebridge/hap-nodejs'
import { YotoPlatform } from './platform.js'

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
 * @returns {string}
 */
function makeAccessToken () {
  /** @param {object} value */
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg: 'none' })}.${encode({ exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`
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

  /** @param {number} failures */
  constructor (failures) {
    super()
    this.failures = failures
  }

  async start () {
    this.startCalls++
    if (this.failures > 0) {
      this.failures--
      throw new Error('getaddrinfo ENOTFOUND api.yotoplay.com')
    }
  }

  async stop () {}

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
  platform.yotoAccount = /** @type {YotoAccount} */ (/** @type {unknown} */ (fake))
}

const flush = () => new Promise(resolve => setImmediate(resolve))

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
