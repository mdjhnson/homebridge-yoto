import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sanitizeName } from './sanitize-name.js'
import { formatError } from './error-format.js'

test('sanitizeName strips disallowed characters and emojis', () => {
  assert.equal(sanitizeName('Otto\'s mini 🎵'), 'Otto\'s mini')
  assert.equal(sanitizeName('  Kitchen   Yoto  '), 'Kitchen Yoto')
  assert.equal(sanitizeName('--Bedroom!'), 'Bedroom')
  assert.equal(sanitizeName('Story time...'), 'Story time.')
  assert.equal(sanitizeName('Peppa & George #1'), 'Peppa & George #1')
})

test('sanitizeName keeps curly apostrophes and quotes as straight ones', () => {
  assert.equal(sanitizeName('Shep\u2019s Stories'), "Shep's Stories")
  assert.equal(sanitizeName('\u201CHello\u201D World'), 'Hello" World')
})

test('sanitizeName shortens names to 64 characters at a word break', () => {
  const name = sanitizeName('My first 100 words in English, Spanish, French, German and Italian')
  assert.equal(name, 'My first 100 words in English, Spanish, French, German and')
  assert.ok(name.length <= 64)
  const long = sanitizeName('x'.repeat(80))
  assert.equal(long.length, 64)
})

test('sanitizeName returns empty string when nothing valid remains', () => {
  assert.equal(sanitizeName('🎵🎵'), '')
})

test('formatError includes API response bodies', () => {
  const error = Object.assign(new Error('Request failed'), { jsonBody: { error: 'invalid_grant' } })
  const formatted = formatError(error)
  assert.match(formatted, /Request failed/)
  assert.match(formatted, /"error":"invalid_grant"/)
})

test('formatError handles non-Error values', () => {
  assert.equal(formatError('plain'), 'plain')
  assert.equal(formatError(null), 'null')
})
