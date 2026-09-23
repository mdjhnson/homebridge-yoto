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
