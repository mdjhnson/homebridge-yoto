/**
 * @param {unknown} value
 * @param {boolean} fallback
 * @returns {boolean}
 */
export function getBooleanSetting (value, fallback) {
  return typeof value === 'boolean' ? value : fallback
}
