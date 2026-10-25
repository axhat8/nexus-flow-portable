import React from 'react';

export const StatusBar = React.memo(function StatusBar({ lastClaim, lastError, edgeStatus }) {
  const isEdgeOnline = edgeStatus?.isConnected || false;
  const edgeTelemetry = edgeStatus?.telemetry || {};
  const edgeRtt = edgeTelemetry?.rttMs || 0;
  const h2PoolReady = edgeTelemetry?.h2PoolReady ?? (edgeTelemetry?.h2Ready ? 1 : 0);
  const totalFiat = edgeTelemetry?.totalFiatClaimed || 0;
  const claimsCount = edgeTelemetry?.claimsToday || 0;
  const competitorMs = edgeTelemetry?.competitorSpeed || null;
  const gatewayPingMs = edgeTelemetry?.gatewayPingMs ?? null;
  const adaptiveMode = edgeTelemetry?.adaptiveLatencyMode || false;
  const wsRedundant = edgeTelemetry?.wsRedundantConnected || false;
  const microBreak = edgeTelemetry?.microBreakActive || false;
  const h2PoolMax = 3;

  return (
    <div className="status-bar" style={{ flexWrap: 'wrap', gap: '8px' }}>
      <div className="status-item" style={{
        background: isEdgeOnline ? 'rgba(16, 185, 129, 0.12)' : 'rgba(245, 158, 11, 0.08)',
        padding: '2px 8px',
        borderRadius: '4px',
        border: `1px solid ${isEdgeOnline ? 'rgba(16, 185, 129, 0.35)' : 'rgba(245, 158, 11, 0.25)'}`
      }}>
        <span className={`dot ${isEdgeOnline ? 'dot-green' : 'dot-amber'}`} />
        <span style={{ color: isEdgeOnline ? 'var(--accent-emerald)' : 'var(--accent-amber)', fontWeight: 600 }}>
          {isEdgeOnline ? `⚡ CLOUD EDGE WIRE: ACTIVE (${edgeRtt}ms)` : 'CLOUD EDGE: DISCONNECTED'}
        </span>
      </div>

      {isEdgeOnline && (
        <div className="status-item" style={{
          background: h2PoolReady >= h2PoolMax ? 'rgba(6, 182, 212, 0.1)' : 'rgba(245, 158, 11, 0.1)',
          padding: '2px 8px',
          borderRadius: '4px',
          border: `1px solid ${h2PoolReady >= h2PoolMax ? 'rgba(6, 182, 212, 0.3)' : 'rgba(245, 158, 11, 0.25)'}`
        }}>
          <span className={`dot ${h2PoolReady >= h2PoolMax ? 'dot-cyan' : 'dot-amber'}`} />
          <span style={{ color: h2PoolReady >= h2PoolMax ? 'var(--accent-cyan)' : 'var(--accent-amber)', fontWeight: 600 }}>
            WIRE POOL: {h2PoolReady}/{h2PoolMax} WARM (0-RTT)
          </span>
        </div>
      )}

      {isEdgeOnline && gatewayPingMs !== null && (
        <div className="status-item" style={{
          background: gatewayPingMs > 60 ? 'rgba(239, 68, 68, 0.12)' : 'rgba(16, 185, 129, 0.12)',
          padding: '2px 8px',
          borderRadius: '4px',
          border: `1px solid ${gatewayPingMs > 60 ? 'rgba(239, 68, 68, 0.35)' : 'rgba(16, 185, 129, 0.35)'}`
        }}>
          <span className={`dot ${gatewayPingMs > 60 ? 'dot-amber' : 'dot-green'}`} />
          <span style={{ color: gatewayPingMs > 60 ? 'var(--accent-amber)' : 'var(--accent-emerald)', fontWeight: 600 }}>
            {gatewayPingMs > 60
              ? `WIRE RTT: ${gatewayPingMs}ms ⚡ ${adaptiveMode ? 'ADAPTIVE MODE ON' : 'US BGP ROUTING'}`
              : `WIRE RTT: ${gatewayPingMs}ms (FRANKFURT 0-RTT ⚡)`}
          </span>
        </div>
      )}

      {isEdgeOnline && adaptiveMode && (
        <div className="status-item" style={{
          background: 'rgba(245, 158, 11, 0.12)',
          padding: '2px 8px',
          borderRadius: '4px',
          border: '1px solid rgba(245, 158, 11, 0.35)'
        }}>
          <span className="dot dot-amber" />
          <span style={{ color: 'var(--accent-amber)', fontWeight: 600 }}>
            ⚡ ADAPTIVE: JITTER OFF (HIGH RTT — WIRE SPEED ONLY)
          </span>
        </div>
      )}

      {isEdgeOnline && wsRedundant && (
        <div className="status-item" style={{
          background: 'rgba(6, 182, 212, 0.08)',
          padding: '2px 8px',
          borderRadius: '4px',
          border: '1px solid rgba(6, 182, 212, 0.2)'
        }}>
          <span className="dot dot-cyan" />
          <span style={{ color: 'var(--accent-cyan)', fontWeight: 600 }}>
            DRWS: DUAL WS ACTIVE
          </span>
        </div>
      )}


      {microBreak && (
        <div className="status-item" style={{
          background: 'rgba(168, 85, 247, 0.15)',
          padding: '2px 8px',
          borderRadius: '4px',
          border: '1px solid rgba(168, 85, 247, 0.35)'
        }}>
          <span className="dot dot-purple" />
          <span style={{ color: '#c084fc', fontWeight: 600 }}>
            🧘 STEALTH MICRO-BREAK (NATURAL REST)
          </span>
        </div>
      )}

      {isEdgeOnline && (edgeTelemetry?.activeProcessingCount > 0) && (
        <div className="status-item" style={{
          background: 'rgba(245, 158, 11, 0.15)',
          padding: '2px 8px',
          borderRadius: '4px',
          border: '1px solid rgba(245, 158, 11, 0.35)'
        }}>
          <span className="dot dot-amber" />
          <span style={{ color: 'var(--accent-amber)', fontWeight: 600 }}>
            CABINET: {edgeTelemetry.activeProcessingCount} IN PROCESSING {edgeTelemetry.acceptLimit ? `(LIMIT: ${edgeTelemetry.acceptLimit})` : ''}
          </span>
        </div>
      )}

      {totalFiat > 0 && (
        <div className="status-item">
          <span>TODAY'S VOLUME:</span>
          <span style={{ color: 'var(--accent-emerald)', fontWeight: 600 }}>
            ₹{Number(totalFiat).toLocaleString()} ({claimsCount} won)
          </span>
        </div>
      )}

      {competitorMs && (
        <div className="status-item">
          <span>COMPETITOR SPEED:</span>
          <span style={{ color: 'var(--accent-amber)', fontWeight: 600 }}>
            ~{competitorMs}ms <span style={{ color: 'var(--accent-cyan)', fontSize: '0.62rem' }}>[⚡ WE ARE {Math.max(1, Math.round(competitorMs / Math.max(1, edgeRtt)))}x FASTER]</span>
          </span>
        </div>
      )}

      <div className="status-item">
        <span className={`dot ${(edgeTelemetry?.consecutiveErrors || 0) > 0 ? 'dot-amber' : 'dot-green'}`} />
        <span>
          CIRCUIT: {(edgeTelemetry?.consecutiveErrors || 0) > 0 ? `${edgeTelemetry.consecutiveErrors}/${edgeTelemetry.maxConsecutiveErrors || 4} CONTENDED` : 'ARMED / OPTIMAL'}
        </span>
      </div>

      <div className="status-item">
        <span>EXCHANGE GATEWAY:</span>
        <span style={{
          color: !gatewayPingMs
            ? 'var(--text-dim)'
            : gatewayPingMs < 80
              ? 'var(--accent-emerald)'
              : gatewayPingMs < 200
                ? 'var(--accent-amber)'
                : 'var(--accent-rose)',
          fontWeight: 600
        }}>
          {gatewayPingMs !== null ? `${gatewayPingMs}ms WIRE` : 'STANDBY'}
        </span>
      </div>

      <div className="status-item">
        <span>LAST CLAIM:</span>
        <span style={{ color: lastClaim ? 'var(--accent-emerald)' : 'var(--text-dim)' }}>
          {lastClaim
            ? `${String(lastClaim.id || '').slice(0, 8)} (₹${Number(lastClaim.amount || 0).toLocaleString()}) @ ${lastClaim.time}`
            : 'NONE'}
        </span>
      </div>

      <div className="status-item">
        <span>{lastError?.isContention ? 'CONTENTION:' : 'LAST FAULT:'}</span>
        <span style={{ color: !lastError ? 'var(--text-dim)' : lastError.isContention ? 'var(--accent-amber)' : 'var(--accent-rose)' }}>
          {lastError ? `${lastError.message} @ ${lastError.time}` : 'NONE'}
        </span>
      </div>
    </div>
  );
});
