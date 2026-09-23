import { createHash, randomBytes } from 'node:crypto'

/**
 * @typedef {Object} PkcePair
 * @property {string} codeVerifier - Secret kept by the plugin until the code exchange
 * @property {string} codeChallenge - S256 challenge sent in the authorize URL
 */

/**
 * Create a PKCE verifier/challenge pair (RFC 7636, S256).
 * @returns {PkcePair}
 */
export function createPkcePair () {
  const codeVerifier = randomBytes(32).toString('base64url')
  const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url')
  return { codeVerifier, codeChallenge }
}

/**
 * Random opaque value used as the OAuth `state` parameter.
 * @returns {string}
 */
export function createOAuthState () {
  return randomBytes(16).toString('base64url')
}

/**
 * @typedef {Object} AuthorizationResponse
 * @property {string} [code] - Authorization code
 * @property {string} [state] - State echoed back by the server
 * @property {string} [error] - OAuth error code (e.g. access_denied)
 * @property {string} [errorDescription] - Human-readable error
 */

/**
 * Parse what the user pasted after signing in: the full redirect URL
 * (http://127.0.0.1:8787/callback?code=...&state=...), just its query string,
 * or the bare authorization code.
 * @param {string} input
 * @returns {AuthorizationResponse}
 */
export function parseAuthorizationResponse (input) {
  const value = input.trim()
  if (!value) return {}

  const looksLikeQuery = value.includes('code=') || value.includes('error=')
  if (!looksLikeQuery) {
    return { code: value }
  }

  let params
  try {
    params = new URL(value).searchParams
  } catch {
    const queryStart = value.indexOf('?')
    params = new URLSearchParams(queryStart >= 0 ? value.slice(queryStart + 1) : value)
  }

  /** @type {AuthorizationResponse} */
  const result = {}
  const code = params.get('code')
  const state = params.get('state')
  const error = params.get('error')
  const errorDescription = params.get('error_description')
  if (code) result.code = code
  if (state) result.state = state
  if (error) result.error = error
  if (errorDescription) result.errorDescription = errorDescription
  return result
}
