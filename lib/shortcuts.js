/** @import { YotoDeviceShortcuts } from 'yoto-nodejs-client/lib/api-endpoints/devices.js' */

/**
 * A playable shortcut configured on a Yoto device.
 * @typedef {Object} ShortcutEntry
 * @property {string} id - Stable identifier derived from the content it plays
 * @property {number} number - 1-based position, used for fallback labels
 * @property {Array<'day' | 'night'>} modes - Modes this shortcut is configured in
 * @property {string} cardId - Card to play
 * @property {string} [chapterKey] - Chapter to start at
 * @property {string} [trackKey] - Track to start at
 */

/** @type {Array<'day' | 'night'>} */
const MODES = ['day', 'night']

/**
 * Extract playable shortcuts from device shortcut config.
 *
 * The same content configured in both day and night mode is returned once.
 * Only `track-play` commands with a card ID are supported.
 *
 * @param {YotoDeviceShortcuts | null | undefined} shortcuts
 * @returns {ShortcutEntry[]}
 */
export function getShortcutEntries (shortcuts) {
  /** @type {Map<string, ShortcutEntry>} */
  const entries = new Map()

  for (const mode of MODES) {
    const content = shortcuts?.modes?.[mode]?.content
    if (!Array.isArray(content)) continue

    for (const item of content) {
      if (!item || item.cmd !== 'track-play') continue
      const cardId = typeof item.params?.card === 'string' ? item.params.card.trim() : ''
      if (!cardId) continue

      const chapterKey = typeof item.params.chapter === 'string' && item.params.chapter ? item.params.chapter : undefined
      const trackKey = typeof item.params.track === 'string' && item.params.track ? item.params.track : undefined
      const id = [cardId, chapterKey ?? '', trackKey ?? ''].join(':')

      const existing = entries.get(id)
      if (existing) {
        if (!existing.modes.includes(mode)) existing.modes.push(mode)
        continue
      }

      entries.set(id, {
        id,
        number: entries.size + 1,
        modes: [mode],
        cardId,
        ...(chapterKey !== undefined && { chapterKey }),
        ...(trackKey !== undefined && { trackKey }),
      })
    }
  }

  return Array.from(entries.values())
}

/**
 * Signature used to detect when the set of shortcuts changes.
 * @param {ShortcutEntry[]} entries
 * @returns {string}
 */
export function getShortcutsSignature (entries) {
  return entries.map(entry => entry.id).join('|')
}
