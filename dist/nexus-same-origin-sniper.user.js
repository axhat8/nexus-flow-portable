// ==UserScript==
// @name         Nexus Flow — Same-Origin P2P Sniper & WebSocket Sniffer
// @namespace    https://welcome.p2p-expert-traders.com/
// @version      2.0.0
// @description  Executes order sniping directly inside the official P2P trader session with authentic Chrome JA4 TLS and native cookies.
// @author       Nexus Flow Team
// @match        https://welcome.p2p-expert-traders.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  console.log('%c[Nexus Flow] Same-Origin Sniper Initializing...', 'color: #00f3ff; font-weight: bold; font-size: 14px;');

  // --- Configuration ---
  const CONFIG = {
    baseInterval: 650,
    minAmount: 10000,
    maxAmount: 100000,
    autoAccept: true,
    enabled: true
  };

  let claimsToday = 0;
  let activeToken = null;
  let lastRtt = 0;
  let consecutive429 = 0;
  let cooldownUntil = 0;
  const acceptingIds = new Set();
  const failedIds = new Map(); // id -> expiry

  // --- 1. Token Harvester & Network Interceptor ---
  function harvestToken() {
    // Check localStorage / sessionStorage
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      const val = localStorage.getItem(key);
      if (val && typeof val === 'string' && val.startsWith('eyJ') && val.includes('.')) {
        activeToken = val.trim();
        return activeToken;
      }
    }
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      const val = sessionStorage.getItem(key);
      if (val && typeof val === 'string' && val.startsWith('eyJ') && val.includes('.')) {
        activeToken = val.trim();
        return activeToken;
      }
    }
    return activeToken;
  }

  // Intercept fetch to automatically capture JWT and track native API calls
  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const [resource, config] = args;
    const url = typeof resource === 'string' ? resource : resource?.url || '';

    if (config?.headers) {
      let authHeader = null;
      if (config.headers instanceof Headers) {
        authHeader = config.headers.get('Authorization') || config.headers.get('authorization');
      } else if (typeof config.headers === 'object') {
        authHeader = config.headers['Authorization'] || config.headers['authorization'];
      }
      if (authHeader && authHeader.includes('Bearer ')) {
        activeToken = authHeader.replace(/^Bearer\s+/i, '').trim();
      }
    }

    return originalFetch.apply(this, args);
  };

  // --- 2. WebSocket & SSE Inspector ---
  const OriginalWebSocket = window.WebSocket;
  window.WebSocket = function (url, protocols) {
    console.log('%c[Nexus Sniffer] Native WebSocket Connected:', 'color: #39ff14; font-weight: bold;', url);
    const ws = new OriginalWebSocket(url, protocols);

    ws.addEventListener('message', (event) => {
      try {
        const data = JSON.parse(event.data);
        // Check for order announcements in socket frames
        if (data && (data.records || data.orders || data.payout || data.fiatAmount || data.id)) {
          console.log('[Nexus Sniffer] Incoming WebSocket Order Frame:', data);
          const orders = Array.isArray(data) ? data : (data.records || [data]);
          for (const order of orders) {
            if (order && order.id && (order.status === 'NEW' || !order.status)) {
              handleSnipeOrder(order);
            }
          }
        }
      } catch {
        // Non-JSON frame (e.g. heartbeat or binary)
      }
    });

    return ws;
  };
  window.WebSocket.prototype = OriginalWebSocket.prototype;

  // --- 3. Direct 1-Step Accept Engine ---
  async function handleSnipeOrder(order) {
    const id = order.id || order.orderId;
    if (!id || !CONFIG.enabled || !CONFIG.autoAccept) return;

    // Dedup and expiry guard
    if (acceptingIds.has(id)) return;
    const failedExpiry = failedIds.get(id);
    if (failedExpiry && Date.now() < failedExpiry) return;

    // Filter check
    const amount = Number(order.fiatAmount || order.buyAmount || order.amount || 0);
    if (CONFIG.minAmount > 0 && amount < CONFIG.minAmount) return;
    if (CONFIG.maxAmount > 0 && amount > CONFIG.maxAmount) return;

    acceptingIds.add(id);
    updateHudStatus(`⚡ Sniping order ${id.slice(0, 8)}... (₹${amount.toLocaleString()})`);

    const token = activeToken || harvestToken();
    if (!token) {
      console.warn('[Nexus Flow] Missing JWT token for claim');
      acceptingIds.delete(id);
      return;
    }

    try {
      const claimStart = Date.now();
      // Direct 1-Step Accept with native Chrome session and cookies!
      const res = await originalFetch(`/api/trade-api/trader-cabinet-pwa/payouts/${id}/accept`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json, text/plain, */*',
          'Origin': window.location.origin,
          'Referer': window.location.href
        },
        body: null
      });

      const latency = Date.now() - claimStart;

      if (res.ok) {
        claimsToday++;
        console.log(`%c[Nexus Flow] ✅ ORDER CLAIMED! ID: ${id} | Latency: ${latency}ms`, 'color: #39ff14; font-weight: bold; font-size: 14px;');
        updateHudStats();
        updateHudStatus(`✅ Claimed ₹${amount.toLocaleString()} in ${latency}ms!`);
      } else {
        console.warn(`[Nexus Flow] Claim rejected (HTTP ${res.status}) in ${latency}ms`);
        failedIds.set(id, Date.now() + 20000);
        updateHudStatus(`❌ Rejected (HTTP ${res.status})`);
      }
    } catch (err) {
      console.error('[Nexus Flow] Claim request error:', err);
      failedIds.set(id, Date.now() + 20000);
    } finally {
      acceptingIds.delete(id);
    }
  }

  // --- 4. Equilibrium Polling Loop (Same-Origin) ---
  async function pollLoop() {
    if (!CONFIG.enabled) {
      setTimeout(pollLoop, 1000);
      return;
    }

    // Cooldown check
    if (Date.now() < cooldownUntil) {
      setTimeout(pollLoop, 500);
      return;
    }

    const token = activeToken || harvestToken();
    if (!token) {
      updateHudStatus('Waiting for JWT token (login to start)...');
      setTimeout(pollLoop, 1500);
      return;
    }

    const reqStart = Date.now();
    try {
      const res = await originalFetch('/api/trade-api/trader-cabinet-pwa/payouts?limit=20&offset=0&status=NEW', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json, text/plain, */*',
          'Origin': window.location.origin,
          'Referer': window.location.href
        }
      });

      lastRtt = Date.now() - reqStart;

      if (res.status === 429) {
        consecutive429++;
        const retryAfter = res.headers.get('retry-after');
        const waitSec = retryAfter ? parseInt(retryAfter, 10) || 3 : 2.5;
        cooldownUntil = Date.now() + waitSec * 1000;
        updateHudStatus(`⚠️ Rate limited (429). Cooldown ${waitSec}s...`);
        setTimeout(pollLoop, waitSec * 1000);
        return;
      }

      if (res.ok) {
        consecutive429 = 0;
        const data = await res.json();
        const records = Array.isArray(data) ? data : (data.records || data.items || data.orders || []);
        
        updateHudStats(records.length);

        if (CONFIG.autoAccept) {
          for (const order of records) {
            if (order && (order.status === 'NEW' || !order.status)) {
              handleSnipeOrder(order);
            }
          }
        }
      }
    } catch (err) {
      console.warn('[Nexus Flow] Poll error:', err);
    }

    // Pacing: 650ms minus RTT compensation with +/- 8% micro-jitter
    const compensated = Math.max(450, CONFIG.baseInterval - Math.round(lastRtt * 0.4));
    const delay = Math.round(compensated * (0.92 + Math.random() * 0.16));
    setTimeout(pollLoop, delay);
  }

  // --- 5. Sleek Floating HUD ---
  let hudStatusEl = null;
  let hudStatsEl = null;

  function createHud() {
    const container = document.createElement('div');
    container.id = 'nexus-sniper-hud';
    container.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 999999;
      background: rgba(10, 14, 26, 0.92);
      backdrop-filter: blur(12px);
      border: 1px solid rgba(0, 243, 255, 0.3);
      border-radius: 12px;
      padding: 14px 18px;
      color: #e2e8f0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace;
      font-size: 12px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5), 0 0 16px rgba(0, 243, 255, 0.15);
      min-width: 260px;
      user-select: none;
    `;

    container.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
        <span style="font-weight: 800; letter-spacing: 0.05em; color: #00f3ff; font-size: 13px;">⚡ NEXUS SNIPER</span>
        <span style="font-size: 10px; padding: 2px 6px; border-radius: 4px; background: rgba(57, 255, 20, 0.15); color: #39ff14; font-weight: 600;">SAME-ORIGIN</span>
      </div>
      <div id="nexus-hud-stats" style="color: #94a3b8; font-size: 11px; margin-bottom: 6px;">
        Claims: <b style="color: #39ff14;">0</b> | Rate: <b>650ms</b> | In Queue: <b>0</b>
      </div>
      <div id="nexus-hud-status" style="color: #38bdf8; font-size: 11px; font-style: italic;">
        Active & Polling...
      </div>
    `;

    document.body.appendChild(container);
    hudStatusEl = document.getElementById('nexus-hud-status');
    hudStatsEl = document.getElementById('nexus-hud-stats');
  }

  function updateHudStatus(text) {
    if (hudStatusEl) hudStatusEl.innerText = text;
  }

  function updateHudStats(queueCount = 0) {
    if (hudStatsEl) {
      hudStatsEl.innerHTML = `Claims: <b style="color: #39ff14;">${claimsToday}</b> | RTT: <b>${lastRtt}ms</b> | Queue: <b>${queueCount}</b>`;
    }
  }

  // --- Start System ---
  window.addEventListener('load', () => {
    createHud();
    harvestToken();
    setTimeout(pollLoop, 1000);
  });

  if (document.readyState === 'complete') {
    createHud();
    harvestToken();
    setTimeout(pollLoop, 1000);
  }
})();
