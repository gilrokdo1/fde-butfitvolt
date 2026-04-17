/** 최소한의 EventEmitter — 컴포넌트 간 느슨한 통신용 */

export class EventBus {
  constructor() {
    this.listeners = new Map();
  }

  on(event, handler) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event).add(handler);
    return () => this.off(event, handler);
  }

  off(event, handler) {
    this.listeners.get(event)?.delete(handler);
  }

  emit(event, payload) {
    const handlers = this.listeners.get(event);
    if (!handlers) return;
    for (const h of handlers) {
      try {
        h(payload);
      } catch (err) {
        console.error(`[EventBus] handler for "${event}" failed:`, err);
      }
    }
  }

  clear() {
    this.listeners.clear();
  }
}
