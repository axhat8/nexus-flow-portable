/**
 * Terminal Logger - Centralized event buffer and console dispatcher.
 * Captures real-time WebSocket frames, polling ticks, rate-limit adaptations,
 * and claim execution results for instant on-screen debugging and 1-click clipboard export.
 */

class LoggerService {
  constructor() {
    this.buffer = [];
    this.maxSize = 120; // Lean rolling buffer to prevent long-running V8 heap bloat
    this.subscribers = new Set();
    this.idCounter = 0;
  }

  subscribe(callback) {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  notify() {
    // If no active subscribers (e.g. debug drawer closed), skip array cloning completely
    if (this.subscribers.size === 0) return;
    const slice = [...this.buffer];
    for (const sub of this.subscribers) {
      try {
        sub(slice);
      } catch {}
    }
  }

  add(type, category, message, meta = null, serverTimestamp = null) {
    const timeStr = serverTimestamp || (() => {
      const now = new Date();
      return now.toLocaleTimeString([], { hour12: false }) + '.' + String(now.getMilliseconds()).padStart(3, '0');
    })();
    
    const entry = {
      id: ++this.idCounter,
      timestamp: timeStr,
      type, // 'info' | 'warn' | 'error' | 'success'
      category, // 'WS' | 'POLL' | 'CLAIM' | 'RATE' | 'SYSTEM'
      message,
      meta
    };

    this.buffer.push(entry);
    if (this.buffer.length > this.maxSize) {
      this.buffer.shift();
    }

    // Mirror to standard developer console only for high-signal events
    // (Prevents DevTools memory accumulation on 10Hz routine heartbeats over hours)
    if (category !== 'POLL' || type === 'error' || type === 'warn') {
      const tag = `[${category}]`;
      if (type === 'error') {
        console.error(tag, message, meta ?? '');
      } else if (type === 'warn') {
        console.warn(tag, message, meta ?? '');
      } else {
        console.log(tag, message, meta ?? '');
      }
    }

    this.notify();
  }

  info(category, message, meta) {
    this.add('info', category, message, meta);
  }

  warn(category, message, meta) {
    this.add('warn', category, message, meta);
  }

  error(category, message, meta) {
    this.add('error', category, message, meta);
  }

  success(category, message, meta) {
    this.add('success', category, message, meta);
  }

  clear() {
    this.buffer = [];
    this.notify();
  }

  exportText() {
    if (this.buffer.length === 0) return 'No logs recorded yet.';
    return this.buffer.map((entry) => {
      const metaStr = entry.meta ? ` | ${typeof entry.meta === 'object' ? JSON.stringify(entry.meta) : entry.meta}` : '';
      return `[${entry.timestamp}] [${entry.category}] [${entry.type.toUpperCase()}] ${entry.message}${metaStr}`;
    }).join('\n');
  }
}

export const logger = new LoggerService();
