/** @import { YotoDeviceShortcuts } from 'yoto-nodejs-client/lib/api-endpoints/devices.js' */
/** @import { PlayableCard } from './card-controls.js' */

/**
 * A playable shortcut configured on a Yoto device.
 * @typedef {Object} ShortcutEntry
 * @property {string} id - Stable identifier derived from the content it plays
 * @property {number} number - 1-based position, used for fallback labels
 * @property {Array<'day' | 'night'>} modes - Modes this shortcut is configured in
 * @property {string} cardId - Card to play
 * @property {string} [chapterKey] - Chapter to start at
 * @property {string} [trackKey] - Track to start at (may contain a date placeholder; see resolveShortcutKey)
 * @property {string} [builtInName] - Name for Yoto's built-in shortcuts (Daily, Radio)
 */

/** @type {Array<'day' | 'night'>} */
const MODES = ['day', 'night']

/**
 * Names for Yoto's built-in shortcuts, keyed by chapter. These live on a system
 * card whose title can't be looked up.
 * @type {Record<string, string>}
 */
const BUILT_IN_SHORTCUT_NAMES = {
  daily: 'Yoto Daily',
  'radio-day': 'Yoto Radio',
  'radio-night': 'Yoto Night Radio',
}

/**
 * Replace date placeholders in shortcut chapter/track keys (e.g. Yoto Daily's
 * `<yyyymmdd>` track) with the current local date.
 * @param {string | undefined} key
 * @param {Date} [now]
 * @returns {string | undefined}
 */
export function resolveShortcutKey (key, now = new Date()) {
  if (!key || !key.includes('<')) return key
  const yyyy = String(now.getFullYear())
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  return key.replaceAll('<yyyymmdd>', `${yyyy}${mm}${dd}`)
}

/**
 * Content to play for a shortcut, labelled for logs.
 * @param {ShortcutEntry} entry
 * @param {string} label
 * @returns {PlayableCard}
 */
export function toPlayableCard (entry, label) {
  return {
    label,
    cardId: entry.cardId,
    ...(entry.chapterKey !== undefined && { chapterKey: entry.chapterKey }),
    ...(entry.trackKey !== undefined && { trackKey: entry.trackKey }),
  }
}

/**
 * startCard() options for a playable card, with date placeholders resolved.
 * @param {PlayableCard} card
 * @param {Date} [now]
 * @returns {{ cardId: string, chapterKey?: string, trackKey?: string }}
 */
export function getCardStartOptions (card, now = new Date()) {
  const chapterKey = resolveShortcutKey(card.chapterKey, now)
  const trackKey = resolveShortcutKey(card.trackKey, now)
  return {
    cardId: card.cardId,
    ...(chapterKey !== undefined && { chapterKey }),
    ...(trackKey !== undefined && { trackKey }),
  }
}

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

      const builtInName = chapterKey ? BUILT_IN_SHORTCUT_NAMES[chapterKey] : undefined
      entries.set(id, {
        id,
        number: entries.size + 1,
        modes: [mode],
        cardId,
        ...(chapterKey !== undefined && { chapterKey }),
        ...(trackKey !== undefined && { trackKey }),
        ...(builtInName !== undefined && { builtInName }),
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
