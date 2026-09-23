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
  /** @type {((event: string, error: unknown) => void) | undefined} */ #onListenerError
  /** @type {Array<[string, Parameters<EventEmitter['on']>[1]]>} */ #entries = []

  /**
   * @param {EventEmitter<TEvents>} emitter
   * @param {(event: string, error: unknown) => void} [onListenerError] - Called when a
   *   listener throws. The device model emits from inside MQTT and timer callbacks, where
   *   an escaping error would be an uncaught exception that stops Homebridge.
   */
  constructor (emitter, onListenerError) {
    this.#emitter = /** @type {EventEmitter} */ (/** @type {unknown} */ (emitter))
    this.#onListenerError = onListenerError
  }

  /**
   * @template {keyof TEvents & string} K
   * @param {K} event
   * @param {(...args: TEvents[K]) => void} listener
   * @returns {this}
   */
  on (event, listener) {
    const onListenerError = this.#onListenerError
    const registered = onListenerError
      ? (/** @type {TEvents[K]} */ ...args) => {
          try {
            listener(...args)
          } catch (error) {
            onListenerError(event, error)
          }
        }
      : listener
    const untyped = /** @type {Parameters<EventEmitter['on']>[1]} */ (registered)
    this.#emitter.on(event, untyped)
    this.#entries.push([event, untyped])
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
