import { test } from 'node:test'
import assert from 'node:assert/strict'
import homebridgeYoto from './index.js'
import { configSchema, serviceSchema } from './config.schema.cjs'

test('exports default function', () => {
  assert.strictEqual(typeof homebridgeYoto, 'function')
})

/**
 * Collect every form key referenced by a schema layout, in order, including repeats.
 * @param {unknown} node
 * @param {string[]} keys
 * @returns {string[]}
 */
function collectLayoutKeys (node, keys = []) {
  if (typeof node === 'string') {
    keys.push(node)
  } else if (Array.isArray(node)) {
    for (const item of node) collectLayoutKeys(item, keys)
  } else if (node && typeof node === 'object') {
    if ('key' in node && typeof node.key === 'string') keys.push(node.key)
    if ('items' in node) collectLayoutKeys(node.items, keys)
  }
  return keys
}

test('every service toggle appears exactly once in the settings layout', () => {
  const layoutKeys = collectLayoutKeys(configSchema.layout)
  for (const name of Object.keys(serviceSchema)) {
    const count = layoutKeys.filter((key) => key === `services.${name}`).length
    assert.strictEqual(count, 1, `services.${name} appears ${count} times in the layout`)
  }
})

test('every service key in the settings layout exists in the schema', () => {
  for (const key of collectLayoutKeys(configSchema.layout)) {
    const name = /^services\.([^.[]+)$/.exec(key)?.[1]
    if (name) assert.ok(name in serviceSchema, `layout key ${key} has no schema property`)
  }
})

/**
 * Paths of schema nodes whose `required` isn't an array of property names.
 * @param {unknown} node
 * @param {string} path
 * @param {string[]} found
 * @returns {string[]}
 */
function findInvalidRequired (node, path = 'schema', found = []) {
  if (!node || typeof node !== 'object') return found
  const record = /** @type {Record<string, unknown>} */ (node)
  if ('required' in record && !Array.isArray(record['required'])) found.push(path)
  const properties = record['properties']
  if (properties && typeof properties === 'object') {
    for (const [key, value] of Object.entries(properties)) findInvalidRequired(value, `${path}.${key}`, found)
  }
  if (record['items']) findInvalidRequired(record['items'], `${path}[]`, found)
  return found
}

// The Homebridge verification checks reject both of these
test('schema only uses required arrays at the object level', () => {
  assert.deepStrictEqual(findInvalidRequired(configSchema.schema), [])
})

test('schema has a name property', () => {
  assert.ok(Object.keys(configSchema.schema.properties.name).length > 0)
})
