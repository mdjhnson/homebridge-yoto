import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  clampPercent,
  clampSteps,
  percentToSteps,
  stepsFromVolumeValue,
  stepsToDevicePercent,
  stepsToPercent,
} from './volume.js'

test('clampPercent clamps and rounds values', () => {
  assert.strictEqual(clampPercent(-5), 0)
  assert.strictEqual(clampPercent(0), 0)
  assert.strictEqual(clampPercent(12.4), 12)
  assert.strictEqual(clampPercent(12.6), 13)
  assert.strictEqual(clampPercent(100), 100)
  assert.strictEqual(clampPercent(250), 100)
  assert.strictEqual(clampPercent(Number.NaN), 0)
})

test('clampSteps clamps values without rounding', () => {
  assert.strictEqual(clampSteps(-1), 0)
  assert.strictEqual(clampSteps(0), 0)
  assert.strictEqual(clampSteps(7.5), 7.5)
  assert.strictEqual(clampSteps(16), 16)
  assert.strictEqual(clampSteps(20), 16)
  assert.strictEqual(clampSteps(Number.NaN), 0)
})

test('stepsToPercent scales steps to percent', () => {
  assert.strictEqual(stepsToPercent(0), 0)
  assert.strictEqual(stepsToPercent(8), 50)
  assert.strictEqual(stepsToPercent(16), 100)
  assert.strictEqual(stepsToPercent(7.5), 47)
})

test('percentToSteps scales percent to steps', () => {
  assert.strictEqual(percentToSteps(0), 0)
  assert.strictEqual(percentToSteps(50), 8)
  assert.strictEqual(percentToSteps(100), 16)
  assert.strictEqual(percentToSteps(12.6), 2)
})

test('stepsFromVolumeValue handles steps or percents', () => {
  assert.strictEqual(stepsFromVolumeValue(12), 12)
  assert.strictEqual(stepsFromVolumeValue(0), 0)
  assert.strictEqual(stepsFromVolumeValue(50), 8)
  assert.strictEqual(stepsFromVolumeValue(18), 3)
  assert.strictEqual(stepsFromVolumeValue(Number.NaN), 0)
})

test('stepsToDevicePercent rounds up so the player lands on the intended step', () => {
  for (let steps = 0; steps <= 16; steps++) {
    const percent = stepsToDevicePercent(steps)
    // Players floor percent back to steps
    assert.equal(Math.floor((percent * 16) / 100), steps, `step ${steps} -> ${percent}%`)
  }
  assert.equal(stepsToDevicePercent(5), 32)
  assert.equal(stepsToDevicePercent(1), 7)
  assert.equal(stepsToDevicePercent(16), 100)
  assert.equal(stepsToDevicePercent(20), 100)
})
