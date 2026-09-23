/** @import { YotoClient } from 'yoto-nodejs-client' */
/** @import { YotoDeviceStatusResponse } from 'yoto-nodejs-client/lib/api-endpoints/devices.js' */

/**
 * Whether an API error means the token lacks a required scope.
 * @param {unknown} error
 * @returns {boolean}
 */
export function isMissingScopeError (error) {
  if (!error || typeof error !== 'object') return false
  const err = /** @type {{ statusCode?: unknown, jsonBody?: { error?: { code?: unknown, message?: unknown } } }} */ (error)
  const message = err.jsonBody?.error?.message
  return err.statusCode === 403 &&
    err.jsonBody?.error?.code === 'forbidden' &&
    typeof message === 'string' &&
    message.includes('scope')
}

/**
 * Make the device status endpoint optional.
 *
 * GET /device-v2/:id/status requires a `family:device-status:view` scope that the
 * Yoto developer dashboard does not currently offer. yoto-nodejs-client treats a
 * failed status fetch as fatal and never opens MQTT, so the players can't be
 * controlled. Status is also delivered by the config endpoint and MQTT, so on a
 * missing-scope error return an empty status response instead.
 *
 * @param {YotoClient} client
 * @param {(message: string) => void} logDebug
 * @returns {void}
 */
export function tolerateMissingStatusScope (client, logDebug) {
  const getDeviceStatus = client.getDeviceStatus.bind(client)
  let logged = false

  client.getDeviceStatus = async (options) => {
    try {
      return await getDeviceStatus(options)
    } catch (error) {
      if (!isMissingScopeError(error)) throw error
      if (!logged) {
        logged = true
        logDebug('Device status endpoint not permitted for this app; using config and MQTT status instead.')
      }
      return /** @type {YotoDeviceStatusResponse} */ (/** @type {unknown} */ ({ deviceId: options.deviceId }))
    }
  }
}
