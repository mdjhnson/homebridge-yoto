/**
 * @fileoverview Family card library lookup for TV inputs.
 */

/** @import { YotoClient } from 'yoto-nodejs-client' */

/**
 * @typedef {Object} LibraryCard
 * @property {string} cardId
 * @property {string} title
 */

const LIBRARY_URL = 'https://api.yotoplay.com/card/family/library'

/**
 * Read `{ cards: [{ cardId, inFamilyLibrary, card: { title } }] }` from
 * GET /card/family/library. Entries without an ID or title, or marked as not
 * in the library, are skipped.
 * @param {unknown} body
 * @returns {LibraryCard[]}
 */
export function parseFamilyLibrary (body) {
  const cards = body && typeof body === 'object' && 'cards' in body && Array.isArray(body.cards)
    ? body.cards
    : []

  /** @type {LibraryCard[]} */
  const result = []
  for (const entry of cards) {
    if (!entry || typeof entry !== 'object') continue
    const record = /** @type {{ cardId?: unknown, inFamilyLibrary?: unknown, card?: { title?: unknown } }} */ (entry)
    if (record.inFamilyLibrary === false) continue
    const cardId = typeof record.cardId === 'string' ? record.cardId.trim() : ''
    const title = typeof record.card?.title === 'string' ? record.card.title.trim() : ''
    if (cardId && title) result.push({ cardId, title })
  }
  return result
}

/**
 * Merge card lists, keeping the first title seen for each card ID.
 * @param {LibraryCard[][]} lists
 * @returns {LibraryCard[]}
 */
export function mergeLibraryCards (...lists) {
  /** @type {Map<string, LibraryCard>} */
  const byId = new Map()
  for (const list of lists) {
    for (const card of list) {
      if (!byId.has(card.cardId)) byId.set(card.cardId, card)
    }
  }
  return [...byId.values()]
}

/**
 * Fetch the family library (needs the `family:library:view` scope).
 * yoto-nodejs-client has no method for this endpoint.
 * @param {YotoClient} client
 * @returns {Promise<LibraryCard[]>}
 */
export async function fetchFamilyLibrary (client) {
  const accessToken = await client.token.getAccessToken()
  const response = await fetch(LIBRARY_URL, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
  })
  if (!response.ok) {
    throw Object.assign(new Error(`Family library request failed (HTTP ${response.status})`), {
      statusCode: response.status,
    })
  }
  return parseFamilyLibrary(await response.json())
}

/**
 * Fetch the user's Make Your Own cards (needs the `user:content:view` scope).
 * @param {YotoClient} client
 * @returns {Promise<LibraryCard[]>}
 */
export async function fetchMyoCards (client) {
  const response = await client.getUserMyoContent()
  /** @type {LibraryCard[]} */
  const result = []
  for (const card of response.cards ?? []) {
    const title = typeof card.title === 'string' ? card.title.trim() : ''
    if (card.cardId && title && !card.deleted) result.push({ cardId: card.cardId, title })
  }
  return result
}
