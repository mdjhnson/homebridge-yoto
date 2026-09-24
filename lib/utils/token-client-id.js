/**
 * @fileoverview Read which OAuth client an access token was issued to.
 */

/**
 * The `azp` (authorized party) claim of a Yoto access token: the client ID it
 * was issued to. Refreshing must use that same client ID, or Yoto rejects the
 * refresh token with invalid_grant. The signature isn't checked; this only
 * picks which client ID to send.
 * @param {unknown} accessToken
 * @returns {string | undefined}
 */
export function getTokenClientId (accessToken) {
  if (typeof accessToken !== 'string') return undefined
  const payload = accessToken.split('.')[1]
  if (!payload) return undefined
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    const azp = claims && typeof claims === 'object' ? claims.azp : undefined
    return typeof azp === 'string' && azp.trim() ? azp.trim() : undefined
  } catch {
    return undefined
  }
}
