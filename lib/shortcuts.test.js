import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getShortcutEntries, getShortcutsSignature } from './shortcuts.js'

/**
 * @param {Array<{ cmd: string, params: { card: string, chapter: string, track: string } }>} day
 * @param {Array<{ cmd: string, params: { card: string, chapter: string, track: string } }>} night
 */
function makeShortcuts (day, night) {
  return { modes: { day: { content: day }, night: { content: night } }, versionId: 'v1' }
}

test('extracts track-play shortcuts in day then night order', () => {
  const entries = getShortcutEntries(makeShortcuts(
    [{ cmd: 'track-play', params: { card: 'abc', chapter: '01', track: '01' } }],
    [{ cmd: 'track-play', params: { card: 'xyz', chapter: '', track: '' } }]
  ))

  assert.deepEqual(entries, [
    { id: 'abc:01:01', number: 1, modes: ['day'], cardId: 'abc', chapterKey: '01', trackKey: '01' },
    { id: 'xyz::', number: 2, modes: ['night'], cardId: 'xyz' },
  ])
})

test('merges the same content configured in both modes', () => {
  const shortcut = { cmd: 'track-play', params: { card: 'abc', chapter: '01', track: '01' } }
  const entries = getShortcutEntries(makeShortcuts([shortcut], [shortcut]))
  assert.equal(entries.length, 1)
  assert.deepEqual(entries[0]?.modes, ['day', 'night'])
})

test('skips unsupported commands and empty cards', () => {
  const entries = getShortcutEntries(makeShortcuts(
    [
      { cmd: 'something-else', params: { card: 'abc', chapter: '', track: '' } },
      { cmd: 'track-play', params: { card: '  ', chapter: '', track: '' } },
    ],
    []
  ))
  assert.deepEqual(entries, [])
})

test('handles missing or empty shortcut config', () => {
  assert.deepEqual(getShortcutEntries(undefined), [])
  assert.deepEqual(getShortcutEntries(null), [])
  assert.deepEqual(getShortcutEntries(makeShortcuts([], [])), [])
})

test('signature changes when shortcut content changes', () => {
  const a = getShortcutEntries(makeShortcuts([{ cmd: 'track-play', params: { card: 'abc', chapter: '', track: '' } }], []))
  const b = getShortcutEntries(makeShortcuts([{ cmd: 'track-play', params: { card: 'def', chapter: '', track: '' } }], []))
  assert.notEqual(getShortcutsSignature(a), getShortcutsSignature(b))
  assert.equal(getShortcutsSignature(a), getShortcutsSignature(a))
})
