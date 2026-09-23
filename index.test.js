import { test } from 'node:test'
import assert from 'node:assert/strict'
import homebridgeYoto from './index.js'
import { configSchema, serviceSchema } from './config.schema.cjs'

test('exports default function', () => {
  assert.strictEqual(typeof homebridgeYoto, 'function')
})

/**
 * Collect every form key referenced by a schema layout.
 * @param {unknown} node
 * @param {Set<string>} keys
 * @returns {Set<string>}
 */
function collectLayoutKeys (node, keys = new Set()) {
  if (typeof node === 'string') {
    keys.add(node)
  } else if (Array.isArray(node)) {
    for (const item of node) collectLayoutKeys(item, keys)
  } else if (node && typeof node === 'object') {
    if ('key' in node && typeof node.key === 'string') keys.add(node.key)
    if ('items' in node) collectLayoutKeys(node.items, keys)
  }
  return keys
}

test('every service toggle appears in the settings layout', () => {
  const layoutKeys = collectLayoutKeys(configSchema.layout)
  for (const name of Object.keys(serviceSchema)) {
    assert.ok(layoutKeys.has(`services.${name}`), `services.${name} is missing from the layout`)
  }
})
