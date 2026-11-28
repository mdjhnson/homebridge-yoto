/**
 * Save a generated native-controls pairing PIN into config.json, so it shows in
 * the plugin settings and stays the same across restarts.
 */

import { randomInt } from 'node:crypto'

const PIN_PATTERN = /^[\x21-\x7E]{4,32}$/

/**
 * A usable pairing PIN: 4 to 32 printable ASCII characters, no spaces.
 * @param {unknown} pin
 * @returns {pin is string}
 */
export function isValidPin (pin) {
  return typeof pin === 'string' && PIN_PATTERN.test(pin)
}

/** A random 8-digit pairing PIN. */
export function generatePin () {
  return String(randomInt(0, 100_000_000)).padStart(8, '0')
}

/**
 * @typedef {Object} PinConfigUpdate
 * @property {string} platform - Platform name to match (e.g. 'Yoto')
 * @property {string} [bridgeUsername] - Child bridge username, to pick the block when there are several
 * @property {string} pin - Newly generated PIN
 */

/**
 * Apply a generated PIN to the contents of a Homebridge config.json.
 *
 * A PIN already saved there wins: a child bridge restarted with a stale copy of
 * the config must not replace the PIN an iPhone already knows.
 *
 * Returns null when the platform block can't be found or the file can't be
 * parsed. Otherwise returns the PIN to use and the file contents, which are
 * unchanged when a PIN was already saved.
 *
 * @param {string} configContents - Raw config.json contents
 * @param {PinConfigUpdate} update
 * @returns {{ contents: string, pin: string } | null}
 */
export function applyNativeControlsPin (configContents, { platform, bridgeUsername, pin }) {
  /** @type {unknown} */
  let parsed
  try {
    parsed = JSON.parse(configContents)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null
  const platforms = /** @type {Record<string, unknown>} */ (parsed)['platforms']
  if (!Array.isArray(platforms)) return null

  /** @type {Record<string, unknown>[]} */
  const candidates = platforms.filter(entry => entry && typeof entry === 'object' && entry.platform === platform)
  const block = bridgeUsername
    ? candidates.find(entry => {
      const bridge = entry['_bridge']
      return bridge && typeof bridge === 'object' && /** @type {Record<string, unknown>} */ (bridge)['username'] === bridgeUsername
    })
    : (candidates.length === 1 ? candidates[0] : undefined)
  if (!block) return null

  const existing = block['nativeControls']
  const settings = existing && typeof existing === 'object' && !Array.isArray(existing)
    ? /** @type {Record<string, unknown>} */ (existing)
    : {}
  const saved = typeof settings['pin'] === 'string' ? settings['pin'].trim() : ''
  if (isValidPin(saved)) return { contents: configContents, pin: saved }

  settings['pin'] = pin
  block['nativeControls'] = settings
  // Homebridge writes config.json with 4-space indentation
  return { contents: JSON.stringify(parsed, null, 4), pin }
}
