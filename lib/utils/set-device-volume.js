/** @import { YotoDeviceModel } from 'yoto-nodejs-client' */

import { stepsToDevicePercent } from './volume.js'

/**
 * Set a player's volume in steps (0-16).
 *
 * yoto-nodejs-client's setVolume() rounds steps to the nearest percent, which
 * the player then floors, making steps 1, 5, 9 and 13 unreachable (step 1 even
 * mutes). Send a rounded-up percentage over MQTT instead.
 * @param {YotoDeviceModel} deviceModel
 * @param {number} steps
 * @returns {Promise<void>}
 */
export async function setDeviceVolume (deviceModel, steps) {
  const mqttClient = deviceModel.mqttClient
  if (mqttClient) {
    await mqttClient.setVolume(stepsToDevicePercent(steps))
    return
  }
  await deviceModel.setVolume(steps)
}
