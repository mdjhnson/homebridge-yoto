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
 */
function makePlatform (services) {
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
    /** @type {{ playbackStatus: string | null, cardId: string | null, sleepTimerActive: boolean }} */
    this.playback = { playbackStatus: 'paused', cardId: null, sleepTimerActive: false }
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
  assert.deepEqual(identifiers, [1, 2, 3, 4])

  const cardInput = accessory.getServiceById(Service.InputSource, 'CardInput:card-z')
  assert.equal(cardInput?.getCharacteristic(Characteristic.ConfiguredName).value, 'Bedtime')
  const shortcutInput = accessory.getServiceById(Service.InputSource, 'ShortcutInput:card-b::')
  assert.equal(shortcutInput?.getCharacteristic(Characteristic.ConfiguredName).value, 'Title card-b')

  // Selecting the card control input starts that card
  await tvService.getCharacteristic(Characteristic.ActiveIdentifier).handleSetRequest(2)
  assert.deepEqual(model.calls.at(-1), ['startCard', { cardId: 'card-z' }])

  // When that card is playing, ActiveIdentifier points at its input
  model.playback.cardId = 'card-z'
  model.playback.playbackStatus = 'playing'
  model.emit('playbackUpdate', model.playback, new Set(['cardId', 'playbackStatus']))
  assert.equal(tvService.getCharacteristic(Characteristic.ActiveIdentifier).value, 2)
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
