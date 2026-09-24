/** @import { PlatformConfig } from 'homebridge' */

/**
 * @typedef {Object} CardControlConfig
 * @property {string} id
 * @property {string} cardId
 * @property {string} label
 * @property {boolean} playOnAll
*/

/**
 * Content a switch or input can start playing.
 * @typedef {Object} PlayableCard
 * @property {string} label - Name used in logs
 * @property {string} cardId
 * @property {string} [chapterKey]
 * @property {string} [trackKey]
 */

import { getTrimmedString } from './utils/get-trimmed-string.js'
import { getBooleanSetting } from './utils/get-boolean-setting.js'
import { getServiceConfig } from './service-config.js'

/**
 * @param {PlatformConfig} config
 * @returns {CardControlConfig[]}
 */
export function getCardControlConfigs (config) {
  const serviceConfig = getServiceConfig(config)

  const rawControls = Array.isArray(serviceConfig['cardControls'])
    ? serviceConfig['cardControls']
    : []

  /** @type {CardControlConfig[]} */
  const controls = []
  const usedIds = new Set()

  for (const entry of rawControls) {
    if (!entry || typeof entry !== 'object') {
      continue
    }

    const record = /** @type {Record<string, unknown>} */ (entry)
    const cardId = getTrimmedString(record['cardId'])
    const label = getTrimmedString(record['label'])

    if (!cardId || !label) {
      continue
    }

    const playOnAll = getBooleanSetting(record['playOnAll'], false)

    let id = cardId
    if (usedIds.has(id)) {
      let suffix = 1
      while (usedIds.has(`${cardId}-${suffix}`)) {
        suffix += 1
      }
      id = `${cardId}-${suffix}`
    }

    usedIds.add(id)
    controls.push({
      id,
      cardId,
      label,
      playOnAll,
    })
  }

  return controls
}
