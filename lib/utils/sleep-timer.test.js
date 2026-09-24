import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  getSleepTimerMinutesPerPercent,
  sleepPercentToSeconds,
  sleepSecondsToPercent,
} from './sleep-timer.js'

test('getSleepTimerMinutesPerPercent defaults, parses and caps the setting', () => {
  assert.strictEqual(getSleepTimerMinutesPerPercent(undefined), 1)
  assert.strictEqual(getSleepTimerMinutesPerPercent(0), 1)
  assert.strictEqual(getSleepTimerMinutesPerPercent(-3), 1)
  assert.strictEqual(getSleepTimerMinutesPerPercent('abc'), 1)
  assert.strictEqual(getSleepTimerMinutesPerPercent(2), 2)
  assert.strictEqual(getSleepTimerMinutesPerPercent('5'), 5)
  assert.strictEqual(getSleepTimerMinutesPerPercent(0.5), 0.5)
  assert.strictEqual(getSleepTimerMinutesPerPercent(60), 10)
})

test('sleepSecondsToPercent rounds up and caps at 100', () => {
  assert.strictEqual(sleepSecondsToPercent(0, 1), 0)
  assert.strictEqual(sleepSecondsToPercent(-10, 1), 0)
  assert.strictEqual(sleepSecondsToPercent(Number.NaN, 1), 0)
  assert.strictEqual(sleepSecondsToPercent(1, 1), 1)
  assert.strictEqual(sleepSecondsToPercent(30 * 60, 1), 30)
  assert.strictEqual(sleepSecondsToPercent(30 * 60 + 1, 1), 31)
  assert.strictEqual(sleepSecondsToPercent(30 * 60, 2), 15)
  assert.strictEqual(sleepSecondsToPercent(3 * 60 * 60, 1), 100)
})

test('sleepPercentToSeconds scales by minutes per percent', () => {
  assert.strictEqual(sleepPercentToSeconds(0, 1), 0)
  assert.strictEqual(sleepPercentToSeconds(45, 1), 45 * 60)
  assert.strictEqual(sleepPercentToSeconds(45, 2), 90 * 60)
  assert.strictEqual(sleepPercentToSeconds(150, 1), 100 * 60)
  assert.strictEqual(sleepPercentToSeconds(-5, 1), 0)
})
