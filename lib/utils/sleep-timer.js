/**
 * @fileoverview Sleep timer slider helpers: each slider percent is a fixed
 * number of minutes (1% = 1 minute by default).
 */

export const DEFAULT_SLEEP_TIMER_MINUTES_PER_PERCENT = 1
export const MAX_SLEEP_TIMER_MINUTES_PER_PERCENT = 10
/** Duration used when the timer is switched on without picking a time */
export const DEFAULT_SLEEP_TIMER_MINUTES = 30

/**
 * Read a minutes-per-percent setting, falling back to the default.
 * @param {unknown} value
 * @returns {number}
 */
export function getSleepTimerMinutesPerPercent (value) {
  const minutes = typeof value === 'string' ? Number(value) : value
  if (typeof minutes !== 'number' || !Number.isFinite(minutes) || minutes <= 0) {
    return DEFAULT_SLEEP_TIMER_MINUTES_PER_PERCENT
  }
  return Math.min(minutes, MAX_SLEEP_TIMER_MINUTES_PER_PERCENT)
}

/**
 * Slider percent for the time left, rounded up so the slider only reaches 0
 * when the timer ends. Timers longer than the slider shows stay at 100.
 * @param {number} remainingSeconds
 * @param {number} minutesPerPercent
 * @returns {number}
 */
export function sleepSecondsToPercent (remainingSeconds, minutesPerPercent) {
  if (!Number.isFinite(remainingSeconds) || remainingSeconds <= 0) return 0
  return Math.min(100, Math.ceil(remainingSeconds / (minutesPerPercent * 60)))
}

/**
 * Timer length in seconds for a slider percent.
 * @param {number} percent
 * @param {number} minutesPerPercent
 * @returns {number}
 */
export function sleepPercentToSeconds (percent, minutesPerPercent) {
  const clamped = Number.isFinite(percent) ? Math.max(0, Math.min(Math.round(percent), 100)) : 0
  return Math.round(clamped * minutesPerPercent * 60)
}
