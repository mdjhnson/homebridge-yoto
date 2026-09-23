/**
 * @typedef {Object} TokenConfigUpdate
 * @property {string} platform - Platform name to match (e.g. 'Yoto')
 * @property {string} accessToken - New access token
 * @property {string} refreshToken - New refresh token (may be rotated)
 * @property {number} tokenExpiresAt - Expiry as a unix timestamp in milliseconds
 * @property {string} [prevAccessToken] - Previous access token, used to pick the right block
 * @property {string} [prevRefreshToken] - Previous refresh token, used to pick the right block
 */

/**
 * Apply refreshed tokens to the contents of a Homebridge config.json.
 *
 * Returns the updated file contents, or null when no matching platform block exists
 * or the file cannot be parsed. When previous tokens are given, only the block that
 * still holds them is updated: if none does, the tokens were changed elsewhere (a new
 * sign-in or a logout in the UI) and must not be overwritten.
 *
 * @param {string} configContents - Raw config.json contents
 * @param {TokenConfigUpdate} update
 * @returns {string | null}
 */
export function applyTokenUpdate (configContents, update) {
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
  const candidates = platforms.filter(
    entry => entry && typeof entry === 'object' && entry.platform === update.platform
  )
  if (candidates.length === 0) return null

  // Update the block holding the tokens being replaced. Only fall back to the single
  // block when there are no previous tokens to match against.
  const hasPrevTokens = Boolean(update.prevRefreshToken || update.prevAccessToken)
  const block = hasPrevTokens
    ? candidates.find(entry =>
      (update.prevRefreshToken && entry['refreshToken'] === update.prevRefreshToken) ||
      (update.prevAccessToken && entry['accessToken'] === update.prevAccessToken)
    )
    : (candidates.length === 1 ? candidates[0] : undefined)
  if (!block) return null

  block['accessToken'] = update.accessToken
  block['refreshToken'] = update.refreshToken
  block['tokenExpiresAt'] = update.tokenExpiresAt

  // Homebridge writes config.json with 4-space indentation
  return JSON.stringify(parsed, null, 4)
}
