/**
 * Hybrid Edge Bridge Service
 * 
 * Seamlessly connects the Localhost Nexus Flow Terminal to the
 * Remote High-Frequency Wire Execution Engine (VPS in Frankfurt or Render Edge).
 * 
 * Provides:
 * - 0-Latency Bidirectional Event Streaming via SSE
 * - Synchronized Credentials & Proactive Direct Login
 * - Wire-level Claim Dispatch via Remote Pre-warmed HTTP/2 Pipeline
 * - Real-time Edge Gateway Latency Measurement
 */

import { logger } from '../utils/logger.js';
import { audio } from '../utils/audio.js';

class EdgeBridgeService {
  constructor() {
    this.edgeUrl = this.getStoredUrl();
    this.isConnected = false;
    this.telemetry = {
      engine: 'HFT-Sniper-Hybrid-v2',
      authenticated: false,
      username: null,
      tokenExpires: null,
      wsConnected: false,
      h2Ready: false,
      h2PoolReady: 0,
      rttMs: 0,
      claimsToday: 0,
      totalFiatClaimed: 0,
      dailyQuotaAmount: 0,
      competitorSpeed: null,
      gatewayPingMs: null,
      microBreakActive: false,
      activeProcessingCount: 0,
      simultaneousCooldownActive: false,
      inFlight: 0,
      uptimeSec: 0
    };

    this.listeners = new Set();
    this.eventSource = null;
    this.pingTimer = null;
    this.reconnectTimer = null;
    this.isReconnecting = false;
  }

  getStoredUrl() {
    try {
      if (typeof localStorage !== 'undefined') {
        const stored = localStorage.getItem('nexus_edge_url');
        if (stored && typeof stored === 'string' && stored.trim()) {
          const clean = stored.trim().replace(/\/+$/, '');
          // Account Safety Guard: Disallow localhost/127.0.0.1 from running locally
          if (clean.includes('localhost') || clean.includes('127.0.0.1') || clean.includes('0.0.0.0')) {
            localStorage.removeItem('nexus_edge_url');
            return '';
          }
          return clean;
        }
      }
    } catch {}
    return '';
  }

  async loadStaticDefaultUrl() {
    if (typeof window === 'undefined') return '';
    try {
      const res = await fetch('/render-edge-url.txt', { cache: 'no-store' });
      if (res.ok) {
        const text = await res.text();
        const cleanUrl = text
          .split('\n')
          .map((l) => l.trim())
          .filter((l) => l && !l.startsWith('#') && !l.startsWith('//'))[0];
        if (cleanUrl && (cleanUrl.startsWith('http://') || cleanUrl.startsWith('https://'))) {
          if (cleanUrl.includes('localhost') || cleanUrl.includes('127.0.0.1') || cleanUrl.includes('0.0.0.0')) {
            return '';
          }
          return cleanUrl.replace(/\/+$/, '');
        }
      }
    } catch {}
    return '';
  }

  setEdgeUrl(url) {
    let clean = (url || '').trim().replace(/\/+$/, '');
    if (clean) {
      if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
        clean = `https://${clean}`;
      }
    }

    // Account Safety Guard: Block localhost and residential loopback execution
    const isLocal = clean.includes('localhost') || clean.includes('127.0.0.1') || clean.includes('0.0.0.0');
    if (isLocal) {
      logger.warn('EDGE:REJECT', 'Local daemon mode is disabled for account safety. Dedicated cloud server (Render / VPS) required.');
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.removeItem('nexus_edge_url');
        }
      } catch {}
      this.edgeUrl = '';
      this.notify({ type: 'URL_REJECTED' });
      return { ok: false, error: 'Local daemon mode is disabled for account safety. Cloud server required.' };
    }

    this.edgeUrl = clean;

    try {
      if (typeof localStorage !== 'undefined') {
        if (clean) {
          localStorage.setItem('nexus_edge_url', clean);
        } else {
          localStorage.removeItem('nexus_edge_url');
        }
      }
    } catch {}

    try {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem('nexus_cached_orders');
      }
    } catch {}

    // Clean reset telemetry for the new isolated backend
    this.isConnected = false;
    this.telemetry = {
      engine: 'HFT-Sniper-Hybrid-v2',
      authenticated: false,
      username: null,
      tokenExpires: null,
      wsConnected: false,
      h2Ready: false,
      h2PoolReady: 0,
      rttMs: 0,
      claimsToday: 0,
      totalFiatClaimed: 0,
      dailyQuotaAmount: 0,
      competitorSpeed: null,
      gatewayPingMs: null,
      microBreakActive: false,
      activeProcessingCount: 0,
      simultaneousCooldownActive: false,
      inFlight: 0,
      uptimeSec: 0
    };

    this.reconnect();
    this.notify({ type: 'URL_CHANGED', edgeUrl: clean });
    return { ok: true, url: clean };
  }

  subscribe(listener) {
    this.listeners.add(listener);
    // Immediately emit current state
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  notify(event = null) {
    const state = this.getState();
    for (const listener of this.listeners) {
      try {
        listener(state, event);
      } catch (err) {
        console.warn('EdgeBridge listener error:', err);
      }
    }
  }

  getState() {
    return {
      edgeUrl: this.edgeUrl,
      isConnected: this.isConnected,
      telemetry: { ...this.telemetry }
    };
  }

  async init() {
    if (!this.edgeUrl) {
      const staticUrl = await this.loadStaticDefaultUrl();
      if (staticUrl) {
        this.edgeUrl = staticUrl;
        try {
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem('nexus_edge_url', staticUrl);
          }
        } catch {}
        this.notify({ type: 'URL_LOADED', edgeUrl: staticUrl });
      }
    }

    if (this.edgeUrl) {
      this.startHealthCheck();
      this.connectEventStream();
    } else {
      this.isConnected = false;
      this.notify({ type: 'NO_EDGE_URL' });
    }
  }

  reconnect() {
    if (this.eventSource) {
      try { this.eventSource.close(); } catch {}
      this.eventSource = null;
    }
    clearTimeout(this.reconnectTimer);
    if (this.edgeUrl) {
      this.connectEventStream();
      this.pingNow();
    } else {
      this.isConnected = false;
      this.notify({ type: 'NO_EDGE_URL' });
    }
  }

  startHealthCheck() {
    clearInterval(this.pingTimer);
    this.pingNow();
    this.pingTimer = setInterval(() => {
      this.pingNow();
    }, 4000);
  }

  async pingNow() {
    if (!this.edgeUrl) {
      this.handleDisconnect();
      this.notify({ type: 'NO_EDGE_URL' });
      return;
    }
    const t0 = performance.now();
    try {
      const res = await fetch(`${this.edgeUrl}/status`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(6000)
      });

      if (res.ok) {
        const data = await res.json();
        const rtt = Math.round(performance.now() - t0);
        this.isConnected = true;
        this.telemetry = {
          ...this.telemetry,
          ...data,
          rttMs: rtt
        };
        this.notify({ type: 'HEARTBEAT', rtt });
      } else {
        this.handleDisconnect();
      }
    } catch {
      this.handleDisconnect();
    }
  }

  handleDisconnect() {
    if (this.isConnected) {
      this.isConnected = false;
      this.telemetry.wsConnected = false;
      this.telemetry.h2Ready = false;
      this.notify({ type: 'DISCONNECTED' });
    }
  }

  connectEventStream() {
    if (typeof window === 'undefined' || !window.EventSource) return;

    if (this.eventSource) {
      try { this.eventSource.close(); } catch {}
      this.eventSource = null;
    }

    if (!this.edgeUrl) {
      this.handleDisconnect();
      return;
    }

    try {
      const streamUrl = `${this.edgeUrl}/events`;
      this.eventSource = new EventSource(streamUrl);

      this.eventSource.onopen = () => {
        this.isConnected = true;
        logger.add('success', 'EDGE', `Connected to Edge Wire Engine: ${this.edgeUrl}`);
        this.notify({ type: 'STREAM_CONNECTED' });
      };

      this.eventSource.onmessage = (e) => {
        try {
          const payload = JSON.parse(e.data);
          this.handleEdgeEvent(payload);
        } catch {}
      };

      this.eventSource.onerror = () => {
        this.handleDisconnect();
        if (this.eventSource) {
          this.eventSource.close();
          this.eventSource = null;
        }
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = setTimeout(() => {
          this.connectEventStream();
        }, 3500);
      };
    } catch {
      this.handleDisconnect();
    }
  }

  handleEdgeEvent(payload) {
    if (!payload || !payload.type) return;

    switch (payload.type) {
      case 'ORDER_NEW': {
        // Only log active incoming orders when trading engine is running
        if (!this.telemetry.isPaused) {
          logger.add('info', 'EDGE:ORDER', `New Order ${String(payload.order?.id || '').slice(0, 8)} (₹${payload.order?.fiatAmount})`, null, payload.timestamp);
        }
        this.notify(payload);
        break;
      }
      case 'CLAIM_SUCCESS': {
        audio.cueForClaimed();
        this.telemetry.claimsToday = (this.telemetry.claimsToday || 0) + 1;
        logger.add('success', 'EDGE:CLAIM', `🏆 CLAIM WON for ${String(payload.order?.id || '').slice(0, 8)} in ${payload.order?.latency}ms (Settlement)`, null, payload.timestamp);
        this.notify(payload);
        break;
      }
      case 'CLAIM_CONTENTION': {
        logger.add('warn', 'EDGE:CONTENTION', payload.order?.message || 'Contested order lock');
        this.notify(payload);
        break;
      }
      case 'CLAIM_REJECTED': {
        const msg = String(payload.order?.message || '');
        const isTierNotice = msg.includes('ceiling') || msg.includes('Limit') || msg.includes('FIRST_N') || msg.includes('exceeds account ceiling');
        if (!isTierNotice) {
          logger.add('error', 'EDGE:REJECT', msg || 'Claim rejected');
        }
        this.notify(payload);
        break;
      }
      case 'LOG': {
        const ev = payload.event;
        if (ev) {
          // Suppress noise when engine is paused or legacy tier skip messages
          if (ev.category?.includes('TIER_SKIP') || (this.telemetry.isPaused && (ev.category === 'WS:SKIP' || ev.category?.includes('SKIP')))) {
            break;
          }
          const isErr = (ev.category?.includes('ERROR') || ev.category?.includes('FAIL')) && 
                        !ev.category?.includes('TIER') && 
                        !ev.category?.includes('NOTICE');
          logger.add(
            isErr ? 'error' : ev.category?.includes('SUCCESS') ? 'success' : ev.category?.includes('WARN') ? 'warn' : 'info',
            `EDGE:${ev.category}`,
            ev.message,
            ev.meta,
            ev.timestamp
          );
        }
        break;
      }
      case 'WS_STATUS': {
        this.telemetry.wsConnected = Boolean(payload.connected);
        this.notify(payload);
        break;
      }
      case 'ENGINE_STATE': {
        if (typeof payload.isPaused === 'boolean') {
          this.telemetry.isPaused = payload.isPaused;
        }
        this.notify(payload);
        break;
      }
      case 'COMPETITOR_SPEED': {
        if (payload.latencyMs) {
          this.telemetry.competitorSpeed = payload.latencyMs;
        }
        this.notify(payload);
        break;
      }
      case 'GATEWAY_PING': {
        if (typeof payload.pingMs === 'number') {
          this.telemetry.gatewayPingMs = payload.pingMs;
        }
        this.notify(payload);
        break;
      }
      case 'ADAPTIVE_MODE': {
        if (typeof payload.active === 'boolean') {
          this.telemetry.adaptiveLatencyMode = payload.active;
        }
        if (typeof payload.pingMs === 'number') {
          this.telemetry.gatewayPingMs = payload.pingMs;
        }
        this.notify(payload);
        break;
      }
      case 'TOKEN_RENEWED': {
        if (payload.tokenExpires) {
          this.telemetry.tokenExpires = payload.tokenExpires;
          logger.add('success', 'EDGE:AUTH', `🔄 Dual-token hot-swapped! Valid until ${new Date(payload.tokenExpires).toLocaleTimeString()}`);
        }
        this.notify(payload);
        break;
      }
      case 'STEALTH_REST': {
        this.telemetry.microBreakActive = true;
        logger.add('info', 'EDGE:STEALTH', `🧘 Natural human stealth break active (${payload.durationSec || 75}s)...`);
        setTimeout(() => {
          this.telemetry.microBreakActive = false;
        }, (payload.durationSec || 75) * 1000);
        this.notify(payload);
        break;
      }
      case 'ENGINE_RESET': {
        this.telemetry.microBreakActive = false;
        logger.add('success', 'EDGE:RESET', '🔄 Engine soft-reset: circuit cleared, all locks released.');
        this.notify(payload);
        break;
      }
      case 'CABINET_STATUS': {
        if (typeof payload.processingCount === 'number') {
          this.telemetry.activeProcessingCount = payload.processingCount;
          this.telemetry.simultaneousCooldownActive = payload.processingCount > 0;
          if (payload.processingCount === 0) {
            logger.add('success', 'EDGE:CABINET', '✅ Cabinet clear: 0 orders in PROCESSING. Full wire speed active.');
          } else {
            logger.add('info', 'EDGE:CABINET', `⏳ Cabinet has ${payload.processingCount} active order(s) in PROCESSING.`);
          }
        }
        this.notify(payload);
        break;
      }
      default: {
        this.notify(payload);
      }
    }
  }

  /**
   * Sync credentials and trading filters to the remote Edge Engine
   */
  async syncConfig(config) {
    if (!this.edgeUrl) {
      return { ok: false, error: 'No Edge Engine URL configured' };
    }
    try {
      if (typeof config?.isPaused === 'boolean') {
        this.telemetry.isPaused = config.isPaused;
      }
      const configKey = JSON.stringify(config);
      const now = Date.now();
      if (this._lastConfigKey === configKey && now - (this._lastConfigTime || 0) < 400) {
        return { ok: true, cached: true };
      }
      this._lastConfigKey = configKey;
      this._lastConfigTime = now;

      const res = await fetch(`${this.edgeUrl}/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      const data = await res.json();
      if (res.ok) {
        this.telemetry.authenticated = Boolean(data.authenticated);
        if (data.username) this.telemetry.username = data.username;
        if (data.tokenExpires) this.telemetry.tokenExpires = data.tokenExpires;
        if (typeof data.isPaused === 'boolean') this.telemetry.isPaused = data.isPaused;
        if (typeof data.claimsToday === 'number') this.telemetry.claimsToday = data.claimsToday;
        if (typeof data.totalFiatClaimed === 'number') this.telemetry.totalFiatClaimed = data.totalFiatClaimed;
        this.notify({ type: 'CONFIG_SYNCED', data });
        return { ok: true, data };
      }
      return { ok: false, error: data.error || 'Config sync rejected' };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  /**
   * Soft-resets the engine circuit breaker, clears locks, without losing today's stats
   */
  async resetEngine() {
    if (!this.edgeUrl) {
      return { ok: false, error: 'No Edge Engine URL configured' };
    }
    try {
      const res = await fetch(`${this.edgeUrl}/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      return { ok: res.ok, data };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  /**
   * Dispatches an order claim via the European wire pipeline
   */
  async dispatchManualClaim(orderId, fiatAmount = 0) {
    if (!this.edgeUrl) {
      return { ok: false, error: 'No Edge Engine URL configured' };
    }
    try {
      const res = await fetch(`${this.edgeUrl}/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: orderId, fiatAmount })
      });
      const data = await res.json();
      return { ok: res.ok, data };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  destroy() {
    clearInterval(this.pingTimer);
    clearTimeout(this.reconnectTimer);
    if (this.eventSource) {
      try { this.eventSource.close(); } catch {}
      this.eventSource = null;
    }
  }
}

export const edgeBridge = new EdgeBridgeService();
