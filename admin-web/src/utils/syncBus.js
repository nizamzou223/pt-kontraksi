/**
 * syncBus — lightweight global event bus for cross-page data sync.
 * Pages broadcast events when they mutate data. Other pages listen and reload.
 *
 * Usage:
 *   import { syncBus } from '../utils/syncBus'
 *   syncBus.emit('kasbon')          // after create/update/delete kasbon
 *   syncBus.on('kasbon', () => load())  // in component useEffect
 */

const listeners = {}

export const syncBus = {
  on(event, fn) {
    if (!listeners[event]) listeners[event] = []
    listeners[event].push(fn)
    // Also listen for window events (cross-component)
    const handler = () => fn()
    window.addEventListener(`sync:${event}`, handler)
    return () => {
      listeners[event] = listeners[event].filter(f => f !== fn)
      window.removeEventListener(`sync:${event}`, handler)
    }
  },
  emit(event) {
    // Dispatch window event (works across all component instances)
    window.dispatchEvent(new CustomEvent(`sync:${event}`))
    window.dispatchEvent(new Event('dataRefreshed'))
    // Also call direct listeners
    ;(listeners[event] || []).forEach(fn => fn())
  },
  // Emit multiple events
  emitAll(...events) {
    events.forEach(e => this.emit(e))
  }
}
