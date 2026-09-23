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
