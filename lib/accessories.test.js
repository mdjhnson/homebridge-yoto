/**
 * Integration tests for the accessory handlers using real HAP-NodeJS services
 * and a fake device model.
 */

/** @import { YotoPlatform, YotoAccessoryContext } from './platform.js' */
/** @import { YotoDeviceModel } from 'yoto-nodejs-client' */
/** @import { PlatformAccessory, Service as HapService } from 'homebridge' */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import * as hap from '@homebridge/hap-nodejs'
import { YotoPlayerAccessory } from './accessory.js'
import { YotoSpeakerAccessory } from './speaker-accessory.js'
import { YotoTelevisionAccessory } from './television-accessory.js'

const { Service, Characteristic } = hap

/**
 * Minimal stand-in for Homebridge's PlatformAccessory backed by a real HAP Accessory.
 */
class FakePlatformAccessory {
  /**
   * @param {string} displayName
   * @param {string} deviceId
   */
  constructor (displayName, deviceId) {
    this.displayName = displayName
    this.UUID = hap.uuid.generate(`${deviceId}:${displayName}`)
    this.hapAccessory = new hap.Accessory(displayName, this.UUID)
    this.context = { device: makeDevice(deviceId, displayName) }
  }

  get services () { return this.hapAccessory.services }

  /** @param {Parameters<hap.Accessory['getService']>[0]} type */
  getService (type) { return this.hapAccessory.getService(type) }

  /**
   * @param {Parameters<hap.Accessory['getServiceById']>[0]} type
   * @param {string} subtype
   */
  getServiceById (type, subtype) { return this.hapAccessory.getServiceById(type, subtype) }

  /** @param {Parameters<hap.Accessory['addService']>} args */
  addService (...args) { return this.hapAccessory.addService(...args) }

  /** @param {hap.Service} service */
  removeService (service) { this.hapAccessory.removeService(service) }
}

/**
 * @param {string} deviceId
 * @param {string} name
 */
function makeDevice (deviceId, name) {
  return {
    deviceId,
    name,
    deviceType: 'v3',
    deviceFamily: 'v3',
    generation: 'gen3',
    formFactor: 'standard',
    online: true,
  }
}

/** @type {string[]} */
let logs = []

/**
 * @param {Record<string, unknown>} services
 * @param {Array<{ cardId: string, title: string }> | (() => Promise<Array<{ cardId: string, title: string }>>)} [libraryCards]
 *   Cards, or a function called for each library fetch
 */
function makePlatform (services, libraryCards = []) {
  const noop = () => {}
  const log = {
    debug: noop,
    info: noop,
    success: noop,
    warn: (/** @type {unknown[]} */ ...args) => { logs.push(`warn: ${args.join(' ')}`) },
    error: (/** @type {unknown[]} */ ...args) => { logs.push(`error: ${args.join(' ')}`) },
    log: noop,
  }
  const platform = {
    log,
    config: { platform: 'Yoto', services },
    api: {
      hap,
      updatePlatformAccessories: noop,
    },
    Service,
    Characteristic,
    getCardTitle: async (/** @type {string} */ cardId) => `Title ${cardId}`,
    getLibraryCards: async () => typeof libraryCards === 'function' ? libraryCards() : libraryCards,
  }
  return /** @type {YotoPlatform} */ (/** @type {unknown} */ (platform))
}

/**
 * Fake YotoDeviceModel: an EventEmitter with state and recorded commands.
 */
class FakeDeviceModel extends EventEmitter {
  /** @type {Array<[string, unknown]>} */ calls = []

  constructor () {
    super()
    this.device = makeDevice('dev-1', 'Kitchen Yoto')
    this.capabilities = { supported: true, hasTemperatureSensor: true, hasColoredNightlight: true }
    this.status = {
      isOnline: true,
      volume: 8,
      batteryLevelPercentage: 80,
      isCharging: false,
      temperatureCelsius: 21,
      firmwareVersion: '1.0.0',
      nightlightMode: 'off',
      dayMode: 'day',
      cardInsertionState: 'none',
    }
    this.config = {
      ambientColour: '0xff0000',
      nightAmbientColour: '0x0000ff',
      dayDisplayBrightness: 50,
      dayDisplayBrightnessAuto: false,
      nightDisplayBrightness: 20,
      nightDisplayBrightnessAuto: false,
      maxVolumeLimit: 16,
      nightMaxVolumeLimit: 8,
      bluetoothEnabled: false,
    }
    /** @type {{ playbackStatus: string | null, cardId: string | null, sleepTimerActive: boolean, sleepTimerSeconds: number | null }} */
    this.playback = { playbackStatus: 'paused', cardId: null, sleepTimerActive: false, sleepTimerSeconds: null }
    this.shortcuts = {
      modes: {
        day: { content: [{ cmd: 'track-play', params: { card: 'card-a', chapter: '02', track: '03' } }] },
        night: { content: [{ cmd: 'track-play', params: { card: 'card-b', chapter: '', track: '' } }] },
      },
      versionId: 'v1',
    }
  }

  /** @param {unknown} options */
  async startCard (options) { this.calls.push(['startCard', options]) }
  async resumeCard () { this.calls.push(['resumeCard', null]) }
  async pauseCard () { this.calls.push(['pauseCard', null]) }
  async stopCard () { this.calls.push(['stopCard', null]) }
  /** @param {number} steps */
  async setVolume (steps) { this.calls.push(['setVolume', steps]) }
  /** @param {number} seconds */
  async setSleepTimer (seconds) { this.calls.push(['setSleepTimer', seconds]) }
  /** @param {unknown} update */
  async updateConfig (update) { this.calls.push(['updateConfig', update]) }

  /** @returns {YotoDeviceModel} */
  asModel () { return /** @type {YotoDeviceModel} */ (/** @type {unknown} */ (this)) }
}

/**
 * @param {FakePlatformAccessory} accessory
 * @returns {PlatformAccessory<YotoAccessoryContext>}
 */
function asAccessory (accessory) {
  return /** @type {PlatformAccessory<YotoAccessoryContext>} */ (/** @type {unknown} */ (accessory))
}

/**
 * @param {FakePlatformAccessory} accessory
 * @param {string} prefix
 * @returns {hap.Service[]}
 */
function servicesWithSubtype (accessory, prefix) {
  return accessory.services.filter(service => (service.subtype ?? '').startsWith(prefix))
}

/** Let pending promise callbacks (e.g. card title lookups) run */
const flush = () => new Promise(resolve => setImmediate(resolve))

test('stopping one accessory leaves listeners from others on the shared device model', async () => {
  logs = []
  const model = new FakeDeviceModel()
  const platform = makePlatform({ television: true })

  const player = new YotoPlayerAccessory({
    platform,
    accessory: asAccessory(new FakePlatformAccessory('Kitchen Yoto', 'dev-1')),
    deviceModel: model.asModel(),
  })
  const tvAccessory = new FakePlatformAccessory('Kitchen Yoto Playback', 'dev-1')
  const tv = new YotoTelevisionAccessory({ platform, accessory: asAccessory(tvAccessory), deviceModel: model.asModel() })

  await player.setup()
  await tv.setup()
  const baseline = model.listenerCount('playbackUpdate')
  assert.ok(baseline >= 2)

  await player.stop()
  assert.equal(model.listenerCount('playbackUpdate'), baseline - 1)
  assert.ok(model.listenerCount('error') >= 1, 'TV keeps its error listener')

  // TV still reacts to playback updates
  model.playback.playbackStatus = 'playing'
  model.emit('playbackUpdate', model.playback, new Set(['playbackStatus']))
  const tvService = tvAccessory.getService(Service.Television)
  assert.equal(tvService?.getCharacteristic(Characteristic.Active).value, Characteristic.Active.ACTIVE)

  // Emitting an error does not throw (a listener still exists)
  assert.doesNotThrow(() => model.emit('error', new Error('boom')))
  await tv.stop()
})

test('shortcut switches play their content and follow shortcut changes', async () => {
  logs = []
  const model = new FakeDeviceModel()
  const accessory = new FakePlatformAccessory('Kitchen Yoto', 'dev-1')
  const player = new YotoPlayerAccessory({
    platform: makePlatform({ shortcuts: true }),
    accessory: asAccessory(accessory),
    deviceModel: model.asModel(),
  })
  await player.setup()
  await flush()

  const switches = servicesWithSubtype(accessory, 'Shortcut:')
  assert.equal(switches.length, 2)
  assert.deepEqual(
    switches.map(service => service.displayName).sort(),
    ['Kitchen Yoto Title card-a', 'Kitchen Yoto Title card-b']
  )

  const dayShortcut = accessory.getServiceById(Service.Switch, 'Shortcut:card-a:02:03')
  assert.ok(dayShortcut)
  await dayShortcut.getCharacteristic(Characteristic.On).handleSetRequest(true)
  assert.deepEqual(model.calls.at(-1), ['startCard', { cardId: 'card-a', chapterKey: '02', trackKey: '03' }])

  // Replace the night shortcut
  model.shortcuts.modes.night.content = [{ cmd: 'track-play', params: { card: 'card-c', chapter: '', track: '' } }]
  model.emit('configUpdate', model.config, new Set())
  await flush()

  const updated = servicesWithSubtype(accessory, 'Shortcut:').map(service => service.subtype).sort()
  assert.deepEqual(updated, ['Shortcut:card-a:02:03', 'Shortcut:card-c::'])
  await player.stop()
})

test('shortcut switches are not created when disabled', async () => {
  const model = new FakeDeviceModel()
  const accessory = new FakePlatformAccessory('Kitchen Yoto', 'dev-1')
  const player = new YotoPlayerAccessory({
    platform: makePlatform({}),
    accessory: asAccessory(accessory),
    deviceModel: model.asModel(),
  })
  await player.setup()
  assert.equal(servicesWithSubtype(accessory, 'Shortcut:').length, 0)
  await player.stop()
})

test('TV exposes card controls and shortcuts as inputs and plays the selected one', async () => {
  logs = []
  const model = new FakeDeviceModel()
  const accessory = new FakePlatformAccessory('Kitchen Yoto Playback', 'dev-1')
  const tv = new YotoTelevisionAccessory({
    platform: makePlatform({
      television: true,
      shortcuts: true,
      cardControls: [{ label: 'Bedtime', cardId: 'card-z' }],
    }),
    accessory: asAccessory(accessory),
    deviceModel: model.asModel(),
  })
  await tv.setup()
  await flush()

  const tvService = accessory.getService(Service.Television)
  assert.ok(tvService)
  const inputs = accessory.services.filter(service => service.UUID === Service.InputSource.UUID)
  assert.equal(inputs.length, 4, 'now playing + 1 card control + 2 shortcuts')
  assert.equal(tvService.linkedServices.length, 4)

  const identifiers = inputs.map(service => service.getCharacteristic(Characteristic.Identifier).value)
  assert.equal(identifiers[0], 1, '"now playing" keeps identifier 1')
  assert.equal(new Set(identifiers).size, 4, 'identifiers are unique')

  const cardInput = accessory.getServiceById(Service.InputSource, 'CardInput:card-z')
  assert.ok(cardInput)
  assert.equal(cardInput.getCharacteristic(Characteristic.ConfiguredName).value, 'Bedtime')
  const cardIdentifier = cardInput.getCharacteristic(Characteristic.Identifier).value
  const shortcutInput = accessory.getServiceById(Service.InputSource, 'ShortcutInput:card-b::')
  assert.equal(shortcutInput?.getCharacteristic(Characteristic.ConfiguredName).value, 'Title card-b')

  // Selecting the card control input starts that card
  await tvService.getCharacteristic(Characteristic.ActiveIdentifier).handleSetRequest(Number(cardIdentifier))
  assert.deepEqual(model.calls.at(-1), ['startCard', { cardId: 'card-z' }])

  // When that card is playing, ActiveIdentifier points at its input
  model.playback.cardId = 'card-z'
  model.playback.playbackStatus = 'playing'
  model.emit('playbackUpdate', model.playback, new Set(['cardId', 'playbackStatus']))
  assert.equal(tvService.getCharacteristic(Characteristic.ActiveIdentifier).value, cardIdentifier)
  assert.equal(tvService.getCharacteristic(Characteristic.Active).value, Characteristic.Active.ACTIVE)

  // Turning the TV off pauses, and the tile stays off once paused
  await tvService.getCharacteristic(Characteristic.Active).handleSetRequest(Characteristic.Active.INACTIVE)
  assert.deepEqual(model.calls.at(-1), ['pauseCard', null])
  model.playback.playbackStatus = 'paused'
  model.emit('playbackUpdate', model.playback, new Set(['playbackStatus']))
  assert.equal(tvService.getCharacteristic(Characteristic.Active).value, Characteristic.Active.INACTIVE)

  // Shortcut removed in the Yoto app -> its input goes away
  model.shortcuts.modes.night.content = []
  model.emit('configUpdate', model.config, new Set())
  assert.equal(accessory.getServiceById(Service.InputSource, 'ShortcutInput:card-b::'), undefined)
  assert.equal(tvService.linkedServices.length, 3)

  await tv.stop()
})

test('SmartSpeaker reports AirPlay enabled and online status', async () => {
  const model = new FakeDeviceModel()
  const accessory = new FakePlatformAccessory('Kitchen Yoto Speaker', 'dev-1')
  const speaker = new YotoSpeakerAccessory({
    platform: makePlatform({ smartSpeaker: true }),
    accessory: asAccessory(accessory),
    deviceModel: model.asModel(),
  })
  await speaker.setup()

  const service = /** @type {HapService} */ (accessory.getService(Service.SmartSpeaker))
  assert.equal(await service.getCharacteristic(Characteristic.AirPlayEnable).handleGetRequest(), 1)
  assert.equal(await service.getCharacteristic(Characteristic.StatusActive).handleGetRequest(), true)

  model.status.isOnline = false
  model.emit('offline', { reason: 'test' })
  assert.equal(service.getCharacteristic(Characteristic.StatusActive).value, false)

  await service.getCharacteristic(Characteristic.TargetMediaState).handleSetRequest(Characteristic.TargetMediaState.STOP)
  assert.deepEqual(model.calls.at(-1), ['pauseCard', null])
  await speaker.stop()
})

/**
 * Decode the Television DisplayOrder TLV into identifiers.
 * @param {unknown} value
 * @returns {number[]}
 */
function decodeDisplayOrder (value) {
  const buffer = Buffer.from(String(value), 'base64')
  /** @type {number[]} */
  const identifiers = []
  for (let offset = 0; offset < buffer.length;) {
    const type = buffer.readUInt8(offset)
    const length = buffer.readUInt8(offset + 1)
    if (type === 0x01) identifiers.push(buffer.readUIntLE(offset + 2, length))
    offset += 2 + length
  }
  return identifiers
}

/**
 * @param {FakePlatformAccessory} accessory
 * @returns {Map<number, string>} identifier -> input name
 */
function inputNames (accessory) {
  return new Map(accessory.services
    .filter(service => service.UUID === Service.InputSource.UUID)
    .map(service => [
      Number(service.getCharacteristic(Characteristic.Identifier).value),
      String(service.getCharacteristic(Characteristic.ConfiguredName).value),
    ]))
}

test('TV adds library cards as inputs, listed alphabetically after "now playing"', async () => {
  logs = []
  const model = new FakeDeviceModel()
  const accessory = new FakePlatformAccessory('Kitchen Yoto Playback', 'dev-1')
  const tv = new YotoTelevisionAccessory({
    platform: makePlatform(
      { television: true, shortcuts: true, cardControls: [{ label: 'Bedtime', cardId: 'card-z' }] },
      [
        { cardId: 'lib-2', title: 'Peter Rabbit' },
        { cardId: 'card-z', title: 'Bedtime Stories' }, // already a card control
        { cardId: 'card-b', title: 'Night Radio' }, // already a whole-card shortcut
        { cardId: 'lib-1', title: 'aesop fables' },
      ]
    ),
    accessory: asAccessory(accessory),
    deviceModel: model.asModel(),
  })
  await tv.setup()
  await flush()
  await flush()

  const libraryInputs = servicesWithSubtype(accessory, 'LibraryInput:')
  assert.deepEqual(libraryInputs.map(service => service.subtype).sort(), ['LibraryInput:lib-1', 'LibraryInput:lib-2'])

  const tvService = /** @type {HapService} */ (accessory.getService(Service.Television))
  const names = inputNames(accessory)
  const order = decodeDisplayOrder(tvService.getCharacteristic(Characteristic.DisplayOrder).value)
  assert.deepEqual(order.map(identifier => names.get(identifier)), [
    'Kitchen Yoto Playback Now Playing',
    'aesop fables',
    'Bedtime',
    'Peter Rabbit',
    'Title card-a',
    'Title card-b',
  ])

  const peter = accessory.getServiceById(Service.InputSource, 'LibraryInput:lib-2')
  const peterIdentifier = Number(peter?.getCharacteristic(Characteristic.Identifier).value)
  await tvService.getCharacteristic(Characteristic.ActiveIdentifier).handleSetRequest(peterIdentifier)
  assert.deepEqual(model.calls.at(-1), ['startCard', { cardId: 'lib-2' }])

  await tv.stop()
})

test('TV caps inputs at the HomeKit limit and warns about the rest', async () => {
  logs = []
  const model = new FakeDeviceModel()
  const accessory = new FakePlatformAccessory('Kitchen Yoto Playback', 'dev-1')
  const cards = Array.from({ length: 120 }, (_, i) => ({ cardId: `lib-${i}`, title: `Card ${i}` }))
  const tv = new YotoTelevisionAccessory({
    platform: makePlatform({ television: true }, cards),
    accessory: asAccessory(accessory),
    deviceModel: model.asModel(),
  })
  await tv.setup()
  await flush()

  const inputs = accessory.services.filter(service => service.UUID === Service.InputSource.UUID)
  assert.equal(inputs.length, 90)
  assert.ok(accessory.services.length <= 100)
  assert.ok(logs.some(line => line.includes('31 library card(s) were left out')))
  // The first cards alphabetically are kept
  assert.ok(accessory.getServiceById(Service.InputSource, 'LibraryInput:lib-0'))
  assert.equal(accessory.getServiceById(Service.InputSource, 'LibraryInput:lib-119'), undefined)
  await tv.stop()
})

test('TV skips library inputs when turned off in settings', async () => {
  const model = new FakeDeviceModel()
  const accessory = new FakePlatformAccessory('Kitchen Yoto Playback', 'dev-1')
  const tv = new YotoTelevisionAccessory({
    platform: makePlatform({ television: true, televisionLibrary: false }, [{ cardId: 'lib-1', title: 'Aesop' }]),
    accessory: asAccessory(accessory),
    deviceModel: model.asModel(),
  })
  await tv.setup()
  await flush()
  assert.equal(servicesWithSubtype(accessory, 'LibraryInput:').length, 0)
  await tv.stop()
})

test('TV keeps library inputs when a refresh fails or a handler is re-attached', async () => {
  const model = new FakeDeviceModel()
  model.playback.cardId = 'lib-2'
  const accessory = new FakePlatformAccessory('Kitchen Yoto Playback', 'dev-1')
  const cards = [{ cardId: 'lib-1', title: 'Aesop' }, { cardId: 'lib-2', title: 'Peter Rabbit' }]
  /** @type {() => Promise<Array<{ cardId: string, title: string }>>} */
  let load = async () => cards
  const platform = makePlatform({ television: true }, () => load())
  const tv = new YotoTelevisionAccessory({ platform, accessory: asAccessory(accessory), deviceModel: model.asModel() })
  await tv.setup()
  await flush()

  const tvService = /** @type {HapService} */ (accessory.getService(Service.Television))
  const peter = /** @type {HapService} */ (accessory.getServiceById(Service.InputSource, 'LibraryInput:lib-2'))
  const peterIdentifier = peter.getCharacteristic(Characteristic.Identifier).value
  // The playing card's input is selected once the library loads
  assert.equal(tvService.getCharacteristic(Characteristic.ActiveIdentifier).value, peterIdentifier)

  // A failed refresh leaves the inputs alone
  load = async () => { throw new Error('HTTP 503') }
  tv.loadLibraryInputs()
  await flush()
  assert.equal(servicesWithSubtype(accessory, 'LibraryInput:').length, 2)
  await tv.stop()

  // A re-attached handler keeps the published inputs while its first load is pending
  /** @type {(cards: Array<{ cardId: string, title: string }>) => void} */
  let finishLoad = () => {}
  load = () => new Promise(resolve => { finishLoad = resolve })
  const again = new YotoTelevisionAccessory({ platform, accessory: asAccessory(accessory), deviceModel: model.asModel() })
  await again.setup()
  assert.equal(accessory.getServiceById(Service.InputSource, 'LibraryInput:lib-2'), peter)
  assert.equal(servicesWithSubtype(accessory, 'LibraryInput:').length, 2)
  await tvService.getCharacteristic(Characteristic.ActiveIdentifier).handleSetRequest(Number(peterIdentifier))
  assert.deepEqual(model.calls.at(-1), ['startCard', { cardId: 'lib-2' }])

  // A card leaving the library doesn't move the others' identifiers
  finishLoad([{ cardId: 'lib-2', title: 'Peter Rabbit' }])
  await flush()
  assert.deepEqual(servicesWithSubtype(accessory, 'LibraryInput:').map(service => service.subtype), ['LibraryInput:lib-2'])
  assert.equal(peter.getCharacteristic(Characteristic.Identifier).value, peterIdentifier)
  await again.stop()
})

/**
 * @param {Record<string, unknown>} services
 */
async function setupSleepTimer (services) {
  const model = new FakeDeviceModel()
  const accessory = new FakePlatformAccessory('Kitchen Yoto', 'dev-1')
  const player = new YotoPlayerAccessory({
    platform: makePlatform({ sleepTimer: true, ...services }),
    accessory: asAccessory(accessory),
    deviceModel: model.asModel(),
  })
  await player.setup()
  const service = accessory.getServiceById(Service.Lightbulb, 'SleepTimer')
  assert.ok(service)
  const sleepCalls = () => model.calls.filter(([name]) => name === 'setSleepTimer').map(([, seconds]) => seconds)
  return { model, accessory, player, service, sleepCalls }
}

test('sleep timer slider sets minutes and turning it on alone uses 30 minutes', async () => {
  const { player, service, sleepCalls } = await setupSleepTimer({})
  const on = service.getCharacteristic(Characteristic.On)
  const brightness = service.getCharacteristic(Characteristic.Brightness)

  await brightness.handleSetRequest(45)
  assert.deepEqual(sleepCalls(), [45 * 60])
  assert.equal(on.value, true)
  assert.equal(brightness.value, 45)

  await on.handleSetRequest(false)
  assert.deepEqual(sleepCalls(), [45 * 60, 0])
  assert.equal(on.value, false)

  // On by itself restarts the last time chosen
  await on.handleSetRequest(true)
  assert.deepEqual(sleepCalls(), [45 * 60, 0, 45 * 60])
  await player.stop()
})

test('sleep timer: dragging an off slider sends only the chosen time', async () => {
  const { player, service, sleepCalls } = await setupSleepTimer({})
  const on = service.getCharacteristic(Characteristic.On)
  const brightness = service.getCharacteristic(Characteristic.Brightness)

  // Home sends On=1 and then the brightness in one write
  await Promise.all([on.handleSetRequest(true), brightness.handleSetRequest(20)])
  assert.deepEqual(sleepCalls(), [20 * 60])

  // Default when nothing was chosen yet is 30 minutes
  const fresh = await setupSleepTimer({})
  await fresh.service.getCharacteristic(Characteristic.On).handleSetRequest(true)
  assert.deepEqual(fresh.sleepCalls(), [30 * 60])
  await fresh.player.stop()
  await player.stop()
})

test('sleep timer follows the player and uses the configured minutes per percent', async () => {
  const { model, accessory, player, service, sleepCalls } = await setupSleepTimer({ sleepTimerMinutesPerPercent: 2 })
  const brightness = service.getCharacteristic(Characteristic.Brightness)

  await brightness.handleSetRequest(45)
  assert.deepEqual(sleepCalls(), [90 * 60])

  // The player confirms the command
  model.playback.sleepTimerActive = true
  model.playback.sleepTimerSeconds = 90 * 60
  model.emit('playbackUpdate', model.playback, new Set(['sleepTimerActive', 'sleepTimerSeconds']))
  assert.equal(brightness.value, 45)

  // The player reports 10 minutes left (set in the Yoto app, say)
  model.playback.sleepTimerActive = true
  model.playback.sleepTimerSeconds = 10 * 60
  model.emit('playbackUpdate', model.playback, new Set(['sleepTimerActive', 'sleepTimerSeconds']))
  assert.equal(brightness.value, 5)
  assert.equal(service.getCharacteristic(Characteristic.On).value, true)

  // Cancelling shows off at once, before the player confirms
  await service.getCharacteristic(Characteristic.On).handleSetRequest(false)
  assert.equal(await service.getCharacteristic(Characteristic.On).handleGetRequest(), false)
  assert.deepEqual(sleepCalls().at(-1), 0)

  // A report sent before the player applied the cancel is ignored
  model.playback.sleepTimerSeconds = 9 * 60
  model.emit('playbackUpdate', model.playback, new Set(['sleepTimerSeconds']))
  assert.equal(service.getCharacteristic(Characteristic.On).value, false)

  // Timer ends on the player
  model.playback.sleepTimerActive = false
  model.playback.sleepTimerSeconds = 0
  model.emit('playbackUpdate', model.playback, new Set(['sleepTimerActive', 'sleepTimerSeconds']))
  assert.equal(service.getCharacteristic(Characteristic.On).value, false)

  // The old Switch from earlier versions is gone
  assert.equal(accessory.getServiceById(Service.Switch, 'SleepTimer'), undefined)
  await player.stop()
})

test('sleep timer shows on when the player says it runs, after an old cancel', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_000_000 })
  const { model, player, service } = await setupSleepTimer({})
  const on = service.getCharacteristic(Characteristic.On)

  await on.handleSetRequest(false)
  t.mock.timers.tick(60_000)

  // Started elsewhere, before the player reports the time left
  model.playback.sleepTimerActive = true
  model.playback.sleepTimerSeconds = null
  model.emit('playbackUpdate', model.playback, new Set(['sleepTimerActive']))
  assert.equal(on.value, true)
  assert.equal(await on.handleGetRequest(), true)
  await player.stop()
})

test('sleep timer: a stopped handler does not start a pending timer', async () => {
  const { player, service, sleepCalls } = await setupSleepTimer({})
  const turnOn = service.getCharacteristic(Characteristic.On).handleSetRequest(true)
  await player.stop()
  await turnOn
  assert.deepEqual(sleepCalls(), [])
})

test('sleep timer replaces the Switch left over from earlier versions', async () => {
  const model = new FakeDeviceModel()
  const accessory = new FakePlatformAccessory('Kitchen Yoto', 'dev-1')
  accessory.addService(Service.Switch, 'Kitchen Yoto Sleep Timer', 'SleepTimer')
  const player = new YotoPlayerAccessory({
    platform: makePlatform({ sleepTimer: true }),
    accessory: asAccessory(accessory),
    deviceModel: model.asModel(),
  })
  await player.setup()
  assert.equal(accessory.getServiceById(Service.Switch, 'SleepTimer'), undefined)
  assert.ok(accessory.getServiceById(Service.Lightbulb, 'SleepTimer'))
  await player.stop()
})
