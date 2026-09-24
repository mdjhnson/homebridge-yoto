import { test } from 'node:test'
import assert from 'node:assert/strict'
import { allocateInputIdentifier, allocateInputIdentifiers, encodeDisplayOrder, sortByName } from './input-order.js'

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

test('allocateInputIdentifiers keeps identifiers inputs already have', () => {
  const hashed = allocateInputIdentifier('LibraryInput:b', new Set())
  // "a" took b's hashed identifier earlier, so b sits one along
  const current = new Map([['LibraryInput:a', hashed], ['LibraryInput:b', hashed + 1]])

  // "a" is gone: b keeps its identifier instead of moving back
  const withoutA = allocateInputIdentifiers(['LibraryInput:b'], current, [1])
  assert.equal(withoutA.get('LibraryInput:b'), hashed + 1)

  // Kept identifiers win over a new input's hashed one, in any order
  const both = allocateInputIdentifiers(['LibraryInput:new', 'LibraryInput:a', 'LibraryInput:b'], current, [1])
  assert.equal(both.get('LibraryInput:a'), hashed)
  assert.equal(both.get('LibraryInput:b'), hashed + 1)
  assert.equal(both.get('LibraryInput:new'), allocateInputIdentifier('LibraryInput:new', new Set([1, hashed, hashed + 1])))

  // Reserved or duplicate identifiers are reallocated
  const clash = allocateInputIdentifiers(['CardInput:x', 'CardInput:y'], new Map([['CardInput:x', 1], ['CardInput:y', 1]]), [1])
  assert.notEqual(clash.get('CardInput:x'), 1)
  assert.notEqual(clash.get('CardInput:y'), 1)
  assert.notEqual(clash.get('CardInput:x'), clash.get('CardInput:y'))
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
