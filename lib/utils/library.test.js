import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseFamilyLibrary } from './library.js'

test('parseFamilyLibrary reads card IDs and titles and skips incomplete entries', () => {
  const cards = parseFamilyLibrary({
    cards: [
      { cardId: 'abc', card: { title: ' The Gruffalo ' } },
      { cardId: 'def', card: {} },
      { card: { title: 'No ID' } },
      null,
      { cardId: 'ghi', inFamilyLibrary: true, card: { title: 'Peter Rabbit' } },
      { cardId: 'jkl', inFamilyLibrary: false, card: { title: 'Removed' } },
      { cardId: 'abc', card: { title: 'Repeated' } },
    ],
  })
  assert.deepStrictEqual(cards, [
    { cardId: 'abc', title: 'The Gruffalo' },
    { cardId: 'ghi', title: 'Peter Rabbit' },
  ])
  assert.deepStrictEqual(parseFamilyLibrary({}), [])
  assert.deepStrictEqual(parseFamilyLibrary(null), [])
})
