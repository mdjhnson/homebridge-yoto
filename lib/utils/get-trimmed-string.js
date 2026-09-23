/**
 * @param {unknown} value
 * @returns {string}
 */
export function getTrimmedString (value) {
  return typeof value === 'string' ? value.trim() : ''
}
