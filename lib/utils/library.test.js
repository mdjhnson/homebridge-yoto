import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mergeLibraryCards, parseFamilyLibrary } from './library.js'

test('parseFamilyLibrary reads card IDs and titles and skips incomplete entries', () => {
  const cards = parseFamilyLibrary({
    cards: [
      { cardId: 'abc', card: { title: ' The Gruffalo ' } },
      { cardId: 'def', card: {} },
      { card: { title: 'No ID' } },
      null,
      { cardId: 'ghi', inFamilyLibrary: true, card: { title: 'Peter Rabbit' } },
      { cardId: 'jkl', inFamilyLibrary: false, card: { title: 'Removed' } },
    ],
  })
  assert.deepStrictEqual(cards, [
    { cardId: 'abc', title: 'The Gruffalo' },
    { cardId: 'ghi', title: 'Peter Rabbit' },
  ])
  assert.deepStrictEqual(parseFamilyLibrary({}), [])
  assert.deepStrictEqual(parseFamilyLibrary(null), [])
})

test('mergeLibraryCards dedupes by card ID, keeping the first title', () => {
  const merged = mergeLibraryCards(
    [{ cardId: 'a', title: 'First' }],
    [{ cardId: 'a', title: 'Second' }, { cardId: 'b', title: 'Other' }]
  )
  assert.deepStrictEqual(merged, [{ cardId: 'a', title: 'First' }, { cardId: 'b', title: 'Other' }])
})
