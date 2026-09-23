import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { ListenerGroup } from './listener-group.js'

test('removeAll only removes listeners registered through the group', () => {
  /** @type {EventEmitter<{ update: [number], error: [Error] }>} */
  const emitter = new EventEmitter()
  const groupA = new ListenerGroup(emitter)
  const groupB = new ListenerGroup(emitter)

  /** @type {number[]} */
  const seenA = []
  /** @type {number[]} */
  const seenB = []
  groupA.on('update', (value) => { seenA.push(value) })
  groupA.on('error', () => {})
  groupB.on('update', (value) => { seenB.push(value) })
  groupB.on('error', () => {})

  emitter.emit('update', 1)
  groupA.removeAll()
  emitter.emit('update', 2)

  assert.deepEqual(seenA, [1])
  assert.deepEqual(seenB, [1, 2])
  assert.equal(emitter.listenerCount('error'), 1, 'other group keeps its error listener')
})

test('removeAll is idempotent', () => {
  /** @type {EventEmitter<{ update: [number] }>} */
  const emitter = new EventEmitter()
  const group = new ListenerGroup(emitter)
  group.on('update', () => {})
  group.removeAll()
  group.removeAll()
  assert.equal(emitter.listenerCount('update'), 0)
})

test('a throwing listener is reported instead of escaping into the emitter', () => {
  /** @type {EventEmitter<{ update: [number] }>} */
  const emitter = new EventEmitter()
  /** @type {Array<[string, unknown]>} */
  const reported = []
  const group = new ListenerGroup(emitter, (event, error) => { reported.push([event, error]) })
  /** @type {number[]} */
  const seen = []
  const failure = new Error('boom')
  group.on('update', () => { throw failure })
  group.on('update', (value) => { seen.push(value) })

  assert.doesNotThrow(() => emitter.emit('update', 1))
  assert.deepEqual(reported, [['update', failure]])
  assert.deepEqual(seen, [1], 'later listeners still run')

  group.removeAll()
  assert.equal(emitter.listenerCount('update'), 0, 'wrapped listeners are removed')
})

test('without an error handler, listener errors propagate', () => {
  /** @type {EventEmitter<{ update: [number] }>} */
  const emitter = new EventEmitter()
  const group = new ListenerGroup(emitter)
  group.on('update', () => { throw new Error('boom') })
  assert.throws(() => emitter.emit('update', 1), /boom/)
})
