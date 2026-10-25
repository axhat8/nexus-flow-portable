import React, { useState, useCallback, useEffect } from 'react';
import { useToken } from '../hooks/useToken';
import { useForegroundService } from '../hooks/useForegroundService';
import { useEdgeBridge } from '../hooks/useEdgeBridge';
import { OrderFeed } from './OrderFeed';
import { SettingsPanel } from './SettingsPanel';
import { TokenInput } from './TokenInput';
import { StatusBar } from './StatusBar';
import { DebugConsole } from './DebugConsole';
import { audio } from '../utils/audio';

export function Terminal() {
  const {
    token,
    payload,
    role,
    isExpired,
    setToken,
    clearToken,
    reauthenticate,
    isReauthenticating,
    hasSavedCredentials
  } = useToken();

  const [isPolling, setIsPolling] = useState(true);
  const [isDebugOpen, setIsDebugOpen] = useState(false);
  const [orders, setOrders] = useState(() => {
    try {
      if (typeof sessionStorage !== 'undefined') {
        const saved = sessionStorage.getItem('nexus_cached_orders');
        if (saved) return JSON.parse(saved);
      }
    } catch {}
    return [];
  });
  const [claimingId, setClaimingId] = useState(null);
  const [claimsToday, setClaimsToday] = useState(0);
  const [lastClaim, setLastClaim] = useState(null);
  const [lastError, setLastError] = useState(null);

  // Cache live orders in sessionStorage to avoid empty feed on page refreshes
  useEffect(() => {
    try {
      if (typeof sessionStorage !== 'undefined' && orders.length > 0) {
        sessionStorage.setItem('nexus_cached_orders', JSON.stringify(orders.slice(0, 50)));
      }
    } catch {}
  }, [orders]);

  // Hybrid Frankfurt Edge Bridge integration
  const handleEdgeEvent = useCallback((event) => {
    if (event.type === 'ORDERS' && Array.isArray(event.orders)) {
      setOrders((prev) => {
        const map = new Map();
        (event.orders || []).forEach((o) => { if (o?.id) map.set(o.id, o); });
        (prev || []).forEach((o) => { if (o?.id && !map.has(o.id)) map.set(o.id, o); });
        return Array.from(map.values()).slice(0, 60);
      });
    } else if (event.type === 'ORDER_NEW' && event.order) {
      setOrders((prev) => {
        if (prev.some((o) => o.id === event.order.id)) return prev;
        return [event.order, ...prev.slice(0, 59)];
      });
    } else if (event.type === 'CLAIM_SUCCESS' && event.order) {
      const now = event.order.time || new Date().toLocaleTimeString([], { hour12: false });
      if (typeof event.claimsToday === 'number') {
        setClaimsToday(event.claimsToday);
      } else {
        setClaimsToday((prev) => prev + 1);
      }
      setLastClaim({
        id: event.order.id,
        amount: event.order.fiatAmount,
        time: `${now} (${event.order.latency || 2}ms wire)`,
        latency: event.order.latency
      });
      setOrders((prev) =>
        prev.map((o) => (o.id === event.order.id ? { ...o, status: 'PROCESSING' } : o))
      );
    } else if (event.type === 'CLAIM_CONTENTION' && event.order) {
      setLastError({
        message: event.order.message || 'Contended order on wire',
        isContention: true,
        time: new Date().toLocaleTimeString([], { hour12: false }),
        orderId: event.order.id
      });
    } else if (event.type === 'CLAIM_REJECTED' && event.order) {
      setLastError({
        message: event.order.message || 'Claim rejected on wire',
        isContention: false,
        time: new Date().toLocaleTimeString([], { hour12: false }),
        orderId: event.order.id
      });
    } else if (event.type === 'ORDER_TAKEN' && event.id) {
      setOrders((prev) =>
        prev.map((o) => (o.id === event.id ? { ...o, status: 'TAKEN' } : o))
      );
    } else if (event.type === 'ENGINE_STATE' && typeof event.isPaused === 'boolean') {
      setIsPolling(!event.isPaused);
    } else if (event.type === 'CABINET_STATUS') {
      if (event.processingCount === 0) {
        setLastError((prev) => (prev?.isContention ? null : prev));
      }
    } else if (event.type === 'URL_CHANGED' || event.type === 'URL_LOADED') {
      setOrders([]);
      setClaimsToday(0);
      setLastClaim(null);
      setLastError(null);
      try {
        if (typeof sessionStorage !== 'undefined') {
          sessionStorage.removeItem('nexus_cached_orders');
        }
      } catch {}
    }
  }, []);

  const {
    edgeUrl,
    isConnected: isEdgeConnected,
    telemetry: edgeTelemetry,
    setEdgeUrl,
    syncConfig: syncEdgeConfig,
    dispatchManualClaim: edgeDispatchClaim,
    resetEngine: resetEdgeEngine,
    reconnect: reconnectEdge
  } = useEdgeBridge(handleEdgeEvent);

  const [settings, setSettings] = useState(() => {
    try {
      if (typeof localStorage !== 'undefined') {
        const saved = localStorage.getItem('nexus_flow_settings');
        if (saved) {
          const parsed = JSON.parse(saved);
          return {
            minAmount: parsed.minAmount ?? '10000',
            maxAmount: parsed.maxAmount ?? '100000',
            acceptLimit: parsed.acceptLimit ?? 'AUTO',
            autoAccept: parsed.autoAccept ?? true,
            audioEnabled: parsed.audioEnabled ?? true,
            useProxy: parsed.useProxy ?? true,
            autoPauseOnWon: parsed.autoPauseOnWon ?? true,
            humanJitterEnabled: parsed.humanJitterEnabled ?? true,
            humanMicroBreaksEnabled: parsed.humanMicroBreaksEnabled ?? true,
            dailyQuotaAmount: parsed.dailyQuotaAmount ?? '0',
            maxConsecutiveErrors: parsed.maxConsecutiveErrors ?? 4,
            pollInterval: typeof parsed.pollInterval === 'number' && [100, 150, 350].includes(parsed.pollInterval) ? parsed.pollInterval : 100
          };
        }
      }
    } catch {}
    return {
      minAmount: '10000',
      maxAmount: '100000',
      acceptLimit: 'AUTO',
      autoAccept: true,
      audioEnabled: true,
      useProxy: true,
      autoPauseOnWon: true,
      humanJitterEnabled: true,
      humanMicroBreaksEnabled: true,
      dailyQuotaAmount: '0',
      maxConsecutiveErrors: 4,
      pollInterval: 100
    };
  });

  const handleUpdateSettings = useCallback((newSettings) => {
    setSettings(newSettings);
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('nexus_flow_settings', JSON.stringify(newSettings));
      }
    } catch {}

    if (isEdgeConnected) {
      syncEdgeConfig({
        minAmount: Number(newSettings.minAmount || 10000),
        maxAmount: Number(newSettings.maxAmount || 100000),
        acceptLimit: newSettings.acceptLimit || 'AUTO',
        autoPauseOnWon: newSettings.autoPauseOnWon !== false,
        humanJitterEnabled: newSettings.humanJitterEnabled !== false,
        humanMicroBreaksEnabled: newSettings.humanMicroBreaksEnabled !== false,
        dailyQuotaAmount: Number(newSettings.dailyQuotaAmount || 0),
        maxConsecutiveErrors: Number(newSettings.maxConsecutiveErrors || 4)
      });
    }
  }, [isEdgeConnected, syncEdgeConfig]);

  // Proactively synchronize token, filters & pause state to Frankfurt Edge Engine whenever connected
  useEffect(() => {
    if (isEdgeConnected) {
      const config = {
        isPaused: !isPolling,
        acceptLimit: settings.acceptLimit || 'AUTO',
        autoPauseOnWon: settings.autoPauseOnWon !== false,
        humanJitterEnabled: settings.humanJitterEnabled !== false,
        humanMicroBreaksEnabled: settings.humanMicroBreaksEnabled !== false,
        dailyQuotaAmount: Number(settings.dailyQuotaAmount || 0),
        maxConsecutiveErrors: Number(settings.maxConsecutiveErrors || 4),
        minAmount: Number(settings.minAmount || 10000),
        maxAmount: Number(settings.maxAmount || 100000)
      };
      if (token && !isExpired) {
        config.token = token;
      }
      syncEdgeConfig(config);
    }
  }, [
    isEdgeConnected,
    token,
    isExpired,
    isPolling,
    settings.minAmount,
    settings.maxAmount,
    settings.acceptLimit,
    settings.autoPauseOnWon,
    settings.humanJitterEnabled,
    settings.humanMicroBreaksEnabled,
    settings.dailyQuotaAmount,
    settings.maxConsecutiveErrors,
    syncEdgeConfig
  ]);

  // Keep sound alert state synchronized with user settings
  useEffect(() => {
    audio.enabled = settings.audioEnabled !== false;
  }, [settings.audioEnabled]);

  const handleToggleEngine = useCallback((forcedState) => {
    audio.initContext();
    if (!token) {
      alert('Please connect a session or sign in first before starting the engine.');
      return;
    }
    if (!edgeUrl || !isEdgeConnected) {
      alert('⚠️ Cloud Edge Backend Offline!\n\nPlease enter your dedicated Render or VPS cloud URL and connect before starting the engine.');
      return;
    }
    const nextState = typeof forcedState === 'boolean' ? forcedState : !isPolling;
    setIsPolling(nextState);
    if (isEdgeConnected) {
      syncEdgeConfig({
        token,
        isPaused: !nextState,
        autoPauseOnWon: settings.autoPauseOnWon !== false,
        humanJitterEnabled: settings.humanJitterEnabled !== false,
        humanMicroBreaksEnabled: settings.humanMicroBreaksEnabled !== false,
        dailyQuotaAmount: Number(settings.dailyQuotaAmount || 0),
        maxConsecutiveErrors: Number(settings.maxConsecutiveErrors || 4),
        minAmount: Number(settings.minAmount || 10000),
        maxAmount: Number(settings.maxAmount || 100000)
      });
    }
  }, [token, edgeUrl, isPolling, isEdgeConnected, syncEdgeConfig, settings]);

  // Native Android background execution
  useForegroundService(isPolling && Boolean(token));

  // Manual claim trigger: pure wire dispatch via Hybrid Edge
  const handleManualClaim = async (order) => {
    setClaimingId(order.id);
    try {
      await edgeDispatchClaim(order.id, order.fiatAmount || order.buyAmount || order.amount || 0);
    } finally {
      setClaimingId(null);
    }
  };

  const isEngineActive = isPolling && Boolean(token) && isEdgeConnected;

  return (
    <div className="terminal-container">
      {/* Header */}
      <header className="terminal-header">
        <div className="brand-section">
          <span className="brand-title">Nexus Flow</span>
          <span className="brand-tag">TERMINAL 007</span>
          <span
            style={{
              fontSize: '0.68rem',
              padding: '2px 8px',
              borderRadius: '4px',
              fontWeight: 700,
              letterSpacing: '0.04em',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              background: isEdgeConnected ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.15)',
              color: isEdgeConnected ? 'var(--accent-emerald)' : 'var(--accent-rose)',
              border: `1px solid ${isEdgeConnected ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.3)'}`
            }}
            title={isEdgeConnected ? `Connected to Frankfurt Cloud Wire (${edgeUrl})` : 'Cloud Wire Engine Offline — Connect dedicated Render or VPS backend'}
          >
            <span className={`engine-pulse-dot ${isEdgeConnected ? 'dot-green' : 'dot-red'}`} style={{ width: '6px', height: '6px' }}></span>
            {isEdgeConnected ? `HYBRID EDGE WIRE (0-RTT)` : 'HYBRID EDGE (OFFLINE)'}
          </span>
        </div>

        {/* Prominent Center Start / Stop Action Button */}
        <div className="engine-action-header">
          <button
            type="button"
            className={`btn-engine-toggle ${isEngineActive ? 'btn-engine-running' : 'btn-engine-stopped'}`}
            onClick={() => handleToggleEngine()}
          >
            {isEngineActive ? (
              <>
                <span className="engine-pulse-dot dot-red"></span>
                <span>⏹ STOP ENGINE</span>
              </>
            ) : (
              <>
                <span className="engine-pulse-dot dot-green"></span>
                <span>▶ START ENGINE</span>
              </>
            )}
          </button>
          <span className="engine-subtext">
            {!token 
              ? 'LOGIN REQUIRED' 
              : isExpired
                ? 'SESSION EXPIRED (401)'
                : !edgeUrl
                  ? '⚠️ CLOUD URL REQUIRED — PASTE YOUR DEDICATED RENDER / VPS URL'
                  : !isEdgeConnected
                    ? '⚠️ CLOUD EDGE OFFLINE — WAITING FOR CONNECTION'
                    : isPolling
                      ? '⚡ HYBRID WIRE STREAM ACTIVE (FRANKFURT 0-RTT)'
                      : '⏹ HYBRID WIRE ENGINE PAUSED'}
          </span>
        </div>

        <div className="telemetry-row">
          <div className="telemetry-item">
            <span className="telemetry-label">Session</span>
            <span className={`telemetry-value ${!token ? 'accent-rose' : isExpired ? 'accent-rose' : 'accent-emerald'}`}>
              {!token ? 'DISCONNECTED' : isExpired ? '401 EXPIRED' : 'TRADER CONNECTED'}
            </span>
          </div>

          <div className="telemetry-item">
            <span className="telemetry-label">Edge Wire</span>
            <span className={`telemetry-value ${isEdgeConnected ? 'accent-emerald' : 'accent-rose'}`}>
              {isEdgeConnected ? `ONLINE (${edgeTelemetry?.rttMs || 2}ms)` : 'DISCONNECTED'}
            </span>
          </div>

          <div className="telemetry-item">
            <span className="telemetry-label">Wire Pool</span>
            <span className={`telemetry-value ${isEdgeConnected ? 'accent-cyan' : 'accent-amber'}`}>
              {isEdgeConnected ? `${edgeTelemetry?.h2PoolReady ?? 3}/3 WARM` : 'STANDBY'}
            </span>
          </div>

          <div className="telemetry-item">
            <span className="telemetry-label">Claims Today</span>
            <span className="telemetry-value accent-emerald">
              {claimsToday} {edgeTelemetry?.totalFiatClaimed > 0 ? `(₹${(edgeTelemetry.totalFiatClaimed / 1000).toFixed(0)}k)` : ''}
            </span>
          </div>
        </div>
      </header>

      {/* Top Telemetry & Status Bar (placed directly above Live Order Feed) */}
      <StatusBar
        lastClaim={lastClaim}
        lastError={lastError}
        edgeStatus={{ isConnected: isEdgeConnected, telemetry: edgeTelemetry }}
      />

      {/* Main Grid */}
      <main className="terminal-grid">
        {/* Left Column: Live Order Feed */}
        <OrderFeed
          orders={orders}
          onClaimOrder={handleManualClaim}
          isClaimingId={claimingId}
          settings={settings}
          token={token}
          isExpired={isExpired}
          isPolling={isPolling}
          onInjectSample={() => {
            const demoAmount = Math.floor(Math.random() * 80000) + 15000;
            const sample = {
              id: 'demo-' + Math.random().toString(36).slice(2, 8),
              fiatAmount: demoAmount,
              payMethod: { name: 'DICTIONARY_PAY_METHOD_IMPS' },
              requisites: { name: 'Verified Trader Sim', accountNumber: '919876543210' },
              status: 'NEW',
              created: new Date().toISOString()
            };
            setOrders((prev) => [sample, ...prev]);
          }}
        />

        {/* Right Column: Settings & Session Control */}
        <div className="settings-column">
          <TokenInput
            token={token}
            role={role}
            payload={payload}
            isExpired={isExpired}
            onSetToken={setToken}
            onClearToken={clearToken}
            reauthenticate={reauthenticate}
            isReauthenticating={isReauthenticating}
            hasSavedCredentials={hasSavedCredentials}
            edgeStatus={{ isConnected: isEdgeConnected, telemetry: edgeTelemetry }}
            edgeUrl={edgeUrl}
            onUpdateEdgeUrl={setEdgeUrl}
            onSyncToEdge={syncEdgeConfig}
            onResetEngine={resetEdgeEngine}
            onReconnectEdge={reconnectEdge}
          />

          <SettingsPanel
            settings={settings}
            onUpdateSettings={handleUpdateSettings}
            edgeStatus={{ isConnected: isEdgeConnected, telemetry: edgeTelemetry }}
          />
        </div>
      </main>

      {/* Live Debug & Telemetry Console Drawer */}
      <DebugConsole
        isOpen={isDebugOpen}
        onToggle={() => setIsDebugOpen(!isDebugOpen)}
      />
    </div>
  );
}
