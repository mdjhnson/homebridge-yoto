import { test } from 'node:test'
import assert from 'node:assert/strict'
import { allocateInputIdentifier, encodeDisplayOrder, sortByName } from './input-order.js'

test('allocateInputIdentifier is stable per subtype and avoids collisions', () => {
  const first = allocateInputIdentifier('LibraryInput:abc', new Set())
  const again = allocateInputIdentifier('LibraryInput:abc', new Set([99]))
  assert.strictEqual(first, again)
  assert.ok(first >= 2, 'identifier 1 is reserved for "now playing"')

  const used = new Set([first])
  const moved = allocateInputIdentifier('LibraryInput:abc', used)
  assert.notStrictEqual(moved, first)
  assert.ok(used.has(moved))
})

test('encodeDisplayOrder writes uint32 TLV entries with separators', () => {
  const decoded = Buffer.from(encodeDisplayOrder([1, 300]), 'base64')
  assert.deepStrictEqual(
    [...decoded],
    [0x01, 0x04, 1, 0, 0, 0, 0x00, 0x00, 0x01, 0x04, 0x2c, 0x01, 0, 0]
  )
  assert.strictEqual(encodeDisplayOrder([]), '')
})

test('sortByName ignores case and orders numbers numerically', () => {
  const sorted = sortByName([
    { name: 'book 10' },
    { name: 'Zoo' },
    { name: 'Book 2' },
    { name: 'apple' },
  ])
  assert.deepStrictEqual(sorted.map(item => item.name), ['apple', 'Book 2', 'book 10', 'Zoo'])
})
