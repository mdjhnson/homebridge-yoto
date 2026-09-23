/** @import { EventEmitter } from 'node:events' */

/**
 * Tracks listeners registered on a shared emitter so they can be removed
 * without disturbing listeners added by other owners.
 *
 * Several accessories share one YotoDeviceModel, so `removeAllListeners`
 * would also strip the other accessories' (and the platform's) handlers.
 *
 * @template {Record<keyof TEvents, unknown[]>} TEvents
 */
export class ListenerGroup {
  /** @type {EventEmitter} */ #emitter
  /** @type {Array<[string, (...args: any[]) => void]>} */ #entries = []

  /**
   * @param {EventEmitter<TEvents>} emitter
   */
  constructor (emitter) {
    this.#emitter = /** @type {EventEmitter} */ (/** @type {unknown} */ (emitter))
  }

  /**
   * @template {keyof TEvents & string} K
   * @param {K} event
   * @param {(...args: TEvents[K]) => void} listener
   * @returns {this}
   */
  on (event, listener) {
    this.#emitter.on(event, listener)
    this.#entries.push([event, listener])
    return this
  }

  /**
   * Remove every listener registered through this group.
   * @returns {void}
   */
  removeAll () {
    for (const [event, listener] of this.#entries) {
      this.#emitter.off(event, listener)
    }
    this.#entries = []
  }
}
