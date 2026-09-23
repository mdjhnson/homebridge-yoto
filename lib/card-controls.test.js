/** @import { PlatformConfig } from 'homebridge' */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getCardControlConfigs } from './card-controls.js'
import { getPlaybackAccessoryConfig, getShortcutsEnabled } from './service-config.js'

/**
 * @param {Record<string, unknown>} services
 * @returns {PlatformConfig}
 */
const config = (services) => ({ platform: 'Yoto', services })

test('card controls: trims values and skips incomplete entries', () => {
  const controls = getCardControlConfigs(config({
    cardControls: [
      { label: ' Bedtime ', cardId: ' abc ' },
      { label: 'No card' },
      { cardId: 'no-label' },
      null,
      'nonsense',
    ],
  }))
  assert.deepEqual(controls, [{ id: 'abc', cardId: 'abc', label: 'Bedtime', playOnAll: false }])
})

test('card controls: gives duplicate card IDs unique ids', () => {
  const controls = getCardControlConfigs(config({
    cardControls: [
      { label: 'One', cardId: 'abc' },
      { label: 'Two', cardId: 'abc', playOnAll: true },
      { label: 'Three', cardId: 'abc' },
    ],
  }))
  assert.deepEqual(controls.map(control => control.id), ['abc', 'abc-1', 'abc-2'])
  assert.equal(controls[1]?.playOnAll, true)
})

test('card controls: handles missing services config', () => {
  assert.deepEqual(getCardControlConfigs({ platform: 'Yoto' }), [])
  assert.deepEqual(getCardControlConfigs(config({ cardControls: 'nope' })), [])
})

test('service config: playback accessory toggles default to off', () => {
  assert.deepEqual(getPlaybackAccessoryConfig({ platform: 'Yoto' }), {
    playbackEnabled: false,
    volumeEnabled: false,
    smartSpeakerEnabled: false,
    televisionEnabled: false,
  })
  assert.deepEqual(getPlaybackAccessoryConfig(config({ playbackControls: true, television: true })), {
    playbackEnabled: true,
    volumeEnabled: true,
    smartSpeakerEnabled: false,
    televisionEnabled: true,
  })
})

test('service config: shortcuts default to off and ignore non-boolean values', () => {
  assert.equal(getShortcutsEnabled({ platform: 'Yoto' }), false)
  assert.equal(getShortcutsEnabled(config({ shortcuts: true })), true)
  assert.equal(getShortcutsEnabled(config({ shortcuts: 'yes' })), false)
})
