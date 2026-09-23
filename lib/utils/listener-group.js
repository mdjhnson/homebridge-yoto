/** @import { EventEmitter } from 'node:events' */
/** @import { Logger } from 'homebridge' */

import { formatError } from './error-format.js'

/**
 * A `ListenerGroup` error callback that logs the failure.
 * @param {Logger} log
 * @param {string} label - Names the listener's owner, e.g. `[Accessory] [Kitchen Yoto]`
 * @returns {(event: string, error: unknown) => void}
 */
export function logListenerError (log, label) {
  return (event, error) => {
    log.error(`${label} Failed to handle ${event} event:`, formatError(error))
  }
}

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
   *   listener throws or its returned promise rejects. The device model emits from inside
   *   MQTT and timer callbacks, where an escaping error would be an uncaught exception
   *   (or unhandled rejection) that stops Homebridge.
   */
  constructor (emitter, onListenerError) {
    this.#emitter = /** @type {EventEmitter} */ (/** @type {unknown} */ (emitter))
    this.#onListenerError = onListenerError
  }

  /**
   * @template {keyof TEvents & string} K
   * @param {K} event
   * @param {(...args: TEvents[K]) => unknown} listener
   * @returns {this}
   */
  on (event, listener) {
    const onListenerError = this.#onListenerError
    const registered = onListenerError
      ? (/** @type {TEvents[K]} */ ...args) => {
          try {
            const result = listener(...args)
            if (result instanceof Promise) {
              result.catch(error => { onListenerError(event, error) })
            }
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
