/** @import { PlatformConfig } from 'homebridge' */

import { getBooleanSetting } from './utils/get-boolean-setting.js'
import { serviceSchema } from '../config.schema.cjs'
import { getSleepTimerMinutesPerPercent } from './utils/sleep-timer.js'

/**
 * The `services` section of the platform config, or {} if missing.
 * @param {PlatformConfig} config
 * @returns {Record<string, unknown>}
 */
export function getServiceConfig (config) {
  const services = config && typeof config === 'object' ? config['services'] : undefined
  return typeof services === 'object' && services !== null
    ? /** @type {Record<string, unknown>} */ (services)
    : {}
}

/**
 * @typedef {Object} PlaybackAccessoryConfig
 * @property {boolean} playbackEnabled
 * @property {boolean} volumeEnabled
 * @property {boolean} smartSpeakerEnabled
 * @property {boolean} televisionEnabled
 */

/**
 * @param {PlatformConfig} config
 * @returns {PlaybackAccessoryConfig}
 */
export function getPlaybackAccessoryConfig (config) {
  const serviceConfig = getServiceConfig(config)

  const playbackEnabled = getBooleanSetting(serviceConfig['playbackControls'], false)
  const smartSpeakerEnabled = getBooleanSetting(serviceConfig['smartSpeaker'], false)
  const televisionEnabled = getBooleanSetting(serviceConfig['television'], false)

  return {
    playbackEnabled,
    volumeEnabled: playbackEnabled,
    smartSpeakerEnabled,
    televisionEnabled,
  }
}

/**
 * Whether shortcut controls are enabled (switches and TV inputs).
 * @param {PlatformConfig} config
 * @returns {boolean}
 */
export function getShortcutsEnabled (config) {
  return getBooleanSetting(getServiceConfig(config)['shortcuts'], serviceSchema.shortcuts.default)
}

/**
 * Whether the TV lists library cards as inputs.
 * @param {PlatformConfig} config
 * @returns {boolean}
 */
export function getTelevisionLibraryEnabled (config) {
  return getBooleanSetting(getServiceConfig(config)['televisionLibrary'], serviceSchema.televisionLibrary.default)
}

/**
 * Minutes each 1% on the sleep timer slider stands for.
 * @param {PlatformConfig} config
 * @returns {number}
 */
export function getSleepTimerIncrement (config) {
  return getSleepTimerMinutesPerPercent(getServiceConfig(config)['sleepTimerMinutesPerPercent'])
}
