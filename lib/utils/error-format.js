/**
 * A one-line description of an error for user-facing logs. Includes the HTTP
 * status for Yoto API errors, whose message alone is always
 * "Unexpected response status code".
 * @param {unknown} error
 * @returns {string}
 */
export function errorMessage (error) {
  const message = error instanceof Error ? error.message : String(error)
  const statusCode = getStatusCode(error)
  return statusCode === undefined ? message : `${message} (HTTP ${statusCode})`
}

/**
 * The HTTP status of a Yoto API error, if the error has one.
 * @param {unknown} error
 * @returns {number | undefined}
 */
export function getStatusCode (error) {
  if (!error || typeof error !== 'object' || !('statusCode' in error)) return undefined
  return typeof error.statusCode === 'number' ? error.statusCode : undefined
}

/**
 * @param {unknown} error
 * @returns {string}
 */
export function formatError (error) {
  const base = error instanceof Error ? (error.stack || error.message) : String(error)
  if (!error || typeof error !== 'object') return base

  const err = /** @type {Record<string, unknown>} */ (error)
  const extra = []
  const jsonBody = 'jsonBody' in err ? err['jsonBody'] : null
  const textBody = 'textBody' in err ? err['textBody'] : null

  if (jsonBody) {
    try {
      extra.push(JSON.stringify(jsonBody))
    } catch {
      extra.push(String(jsonBody))
    }
  }

  if (typeof textBody === 'string' && textBody.length) {
    if (typeof jsonBody !== 'string' || textBody !== jsonBody) {
      extra.push(textBody)
    }
  }

  return extra.length ? `${base}\n${extra.join('\n')}` : base
}
