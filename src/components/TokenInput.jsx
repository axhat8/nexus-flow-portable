import React, { useState } from 'react';
import { login } from '../utils/auth';
import { Eye, EyeOff, ShieldCheck, RefreshCw, AlertCircle, CheckCircle2, Lock } from 'lucide-react';

export const TokenInput = React.memo(function TokenInput({
  token,
  role,
  payload,
  isExpired,
  onSetToken,
  onClearToken,
  reauthenticate,
  isReauthenticating,
  hasSavedCredentials: propHasSavedCredentials,
  edgeStatus,
  edgeUrl,
  onUpdateEdgeUrl,
  onSyncToEdge,
  onResetEngine,
  onReconnectEdge
}) {
  const [isResetting, setIsResetting] = useState(false);
  const [resetFeedback, setResetFeedback] = useState('');

  const handleReset = async () => {
    if (!onResetEngine) return;
    setIsResetting(true);
    setResetFeedback('Resetting...');
    try {
      const res = await onResetEngine();
      if (res && res.ok) {
        setResetFeedback('✓ Circuit Cleared');
      } else {
        setResetFeedback('Reset Sent');
      }
      setTimeout(() => setResetFeedback(''), 3000);
    } catch {
      setResetFeedback('Reset Failed');
      setTimeout(() => setResetFeedback(''), 3000);
    } finally {
      setIsResetting(false);
    }
  };

  const [showPassword, setShowPassword] = useState(false);
  const [username, setUsername] = useState(() => {
    try { return localStorage.getItem('nexus_saved_username') || ''; } catch { return ''; }
  });
  const [password, setPassword] = useState(() => {
    try { return localStorage.getItem('nexus_saved_password') || ''; } catch { return ''; }
  });
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [rememberSession, setRememberSession] = useState(true);
  const [loginLoading, setLoginLoading] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [inputEdgeUrl, setInputEdgeUrl] = useState(edgeUrl || '');
  const [prevEdgeUrl, setPrevEdgeUrl] = useState(edgeUrl);

  if (edgeUrl !== prevEdgeUrl) {
    setPrevEdgeUrl(edgeUrl);
    setInputEdgeUrl(edgeUrl || '');
  }

  const handleDirectLogin = async (e) => {
    if (e) e.preventDefault();
    if (!username || !password) return;

    setLoginLoading(true);
    setFeedback(null);
    try {
      let tokenAcquired = null;
      let cookiesAcquired = null;

      // 1. If Frankfurt Edge is connected, sync credentials & authenticate via Edge pipeline
      if (edgeStatus?.isConnected && onSyncToEdge) {
        const edgeRes = await onSyncToEdge({
          username: username.trim(),
          password,
          code: twoFactorCode
        });
        if (edgeRes?.ok) {
          tokenAcquired = edgeRes.data?.token || null;
        }
      }

      // 2. If token not acquired via Edge, authenticate directly
      if (!tokenAcquired) {
        try {
          const res = await login({ username, password, code: twoFactorCode });
          tokenAcquired = res.token;
          cookiesAcquired = res.cookies;
        } catch (localErr) {
          if (!tokenAcquired) throw localErr;
        }
      }

      if (tokenAcquired) {
        onSetToken(tokenAcquired, cookiesAcquired);
      }

      if (rememberSession) {
        try {
          localStorage.setItem('nexus_saved_username', username.trim());
          localStorage.setItem('nexus_saved_password', password);
        } catch {}
      }

      setFeedback({
        type: 'success',
        msg: edgeStatus?.isConnected
          ? '⚡ Logged in & synced with Frankfurt Edge Engine!'
          : 'Authenticated successfully. Session saved!'
      });
      setTwoFactorCode('');
    } catch (err) {
      setFeedback({ type: 'error', msg: err.message });
    } finally {
      setLoginLoading(false);
    }
  };

  const handleClearAll = () => {
    onClearToken();
    try {
      localStorage.removeItem('nexus_saved_username');
      localStorage.removeItem('nexus_saved_password');
      localStorage.removeItem('nexus_flow_cookies');
    } catch {}
    setUsername('');
    setPassword('');
    setFeedback({ type: 'success', msg: 'Session and saved credentials cleared.' });
    setTimeout(() => setFeedback(null), 3000);
  };

  const hasSavedCredentials = Boolean(propHasSavedCredentials ?? (username && password));
  const isBusy = loginLoading || isReauthenticating;

  return (
    <div className="glass-panel settings-panel">
      <div className="panel-header" style={{ padding: '0 0 10px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Lock size={14} style={{ color: 'var(--accent-cyan)' }} />
          <span>Direct Login</span>
          {hasSavedCredentials && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '1px 6px',
                borderRadius: '4px',
                fontSize: '0.62rem',
                fontFamily: 'var(--font-mono)',
                background: 'rgba(16, 185, 129, 0.12)',
                color: 'var(--accent-emerald)',
                border: '1px solid rgba(16, 185, 129, 0.25)'
              }}
              title="Silent background renewal enabled on token expiration or 401"
            >
              <ShieldCheck size={11} /> Auto-Renew
            </span>
          )}
        </div>
      </div>

      {/* Edge Wire Engine Connection Box */}
      <div style={{
        background: edgeStatus?.isConnected ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)',
        border: `1px solid ${edgeStatus?.isConnected ? 'rgba(16, 185, 129, 0.25)' : 'rgba(239, 68, 68, 0.25)'}`,
        borderRadius: '6px',
        padding: '8px 10px',
        marginBottom: '12px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
          <span style={{
            fontSize: '0.65rem',
            fontWeight: 700,
            letterSpacing: '0.04em',
            color: edgeStatus?.isConnected ? 'var(--accent-emerald)' : 'var(--accent-rose)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px'
          }}>
            <span className={`engine-pulse-dot ${edgeStatus?.isConnected ? 'dot-green' : inputEdgeUrl ? 'dot-red' : 'dot-amber'}`} style={{ width: '6px', height: '6px' }} />
            {edgeStatus?.isConnected
              ? `EDGE BACKEND: CONNECTED (${edgeStatus.telemetry?.rttMs || 2}ms)`
              : inputEdgeUrl
                ? 'EDGE BACKEND: DISCONNECTED'
                : 'EDGE BACKEND: NOT CONFIGURED'}
          </span>
          <span style={{ fontSize: '0.58rem', color: 'var(--text-muted)' }}>
            🔒 Unique per trader
          </span>
        </div>

        <div style={{ display: 'flex', gap: '6px' }}>
          <input
            type="text"
            className="input-dense"
            placeholder="https://your-bot.onrender.com or VPS URL"
            value={inputEdgeUrl}
            onChange={(e) => setInputEdgeUrl(e.target.value)}
            style={{ fontSize: '0.66rem', fontFamily: 'var(--font-mono)', flex: 1 }}
          />
          <button
            type="button"
            className="btn-dense"
            style={{ width: 'auto', padding: '3px 10px', fontSize: '0.65rem', background: 'var(--accent-cyan)', color: '#041017', fontWeight: 700 }}
            onClick={() => {
              const clean = (inputEdgeUrl || '').trim();
              if (!clean) return;
              if (clean.includes('localhost') || clean.includes('127.0.0.1') || clean.includes('0.0.0.0')) {
                setFeedback({
                  type: 'error',
                  message: '⚠️ Local daemon mode disabled for account safety. Cloud server required.'
                });
                return;
              }
              if (onUpdateEdgeUrl) onUpdateEdgeUrl(clean);
            }}
          >
            Connect
          </button>
          {edgeUrl && (
            <button
              type="button"
              className="btn-dense"
              style={{ width: 'auto', padding: '3px 8px', fontSize: '0.62rem', background: 'rgba(239, 68, 68, 0.15)', color: 'var(--accent-rose)' }}
              onClick={() => {
                setInputEdgeUrl('');
                if (onUpdateEdgeUrl) onUpdateEdgeUrl('');
              }}
              title="Clear cloud URL and disconnect"
            >
              ✕ Clear
            </button>
          )}
          {onReconnectEdge && (
            <button
              type="button"
              className="btn-dense"
              style={{ width: 'auto', padding: '3px 8px', fontSize: '0.65rem' }}
              onClick={onReconnectEdge}
              title="Force reconnect SSE event stream"
            >
              🔄
            </button>
          )}
        </div>

        {!edgeStatus?.isConnected && (
          <div style={{ fontSize: '0.6rem', color: 'var(--accent-amber)', marginTop: '4px', lineHeight: 1.3 }}>
            {!inputEdgeUrl
              ? '⚠️ Dedicated cloud backend required. Paste your own Render or VPS URL above and click Connect.'
              : '⚠️ Disconnected from cloud backend. Checking connection or waiting for server...'}
          </div>
        )}

        {onResetEngine && (
          <div style={{ marginTop: '5px' }}>
            <button
              type="button"
              className="btn-dense"
              disabled={isResetting}
              onClick={handleReset}
              style={{
                width: '100%',
                padding: '4px 8px',
                fontSize: '0.65rem',
                fontWeight: 600,
                background: 'rgba(239, 68, 68, 0.15)',
                color: 'var(--accent-rose)',
                borderColor: 'rgba(239, 68, 68, 0.4)'
              }}
            >
              {resetFeedback || '⚡ Reset Circuit / Clear Locks'}
            </button>
          </div>
        )}

        {edgeStatus?.telemetry?.microBreakActive && (
          <div style={{
            fontSize: '0.62rem',
            padding: '3px 6px',
            marginTop: '6px',
            borderRadius: '4px',
            background: 'rgba(168, 85, 247, 0.2)',
            color: '#c084fc',
            border: '1px solid rgba(168, 85, 247, 0.4)'
          }}>
            🧘 Stealth break active (natural cooldown). Click "Reset Circuit" to resume immediately.
          </div>
        )}

        <span style={{ fontSize: '0.58rem', color: 'var(--text-dim)', marginTop: '4px', display: 'block' }}>
          🔒 Dedicated Cloud Engine: Each trader must run their own backend instance for IP safety and 0-RTT execution.
        </span>
      </div>

      {feedback && (
        <div style={{
          padding: '6px 10px',
          marginBottom: '10px',
          borderRadius: '4px',
          fontSize: '0.72rem',
          fontFamily: 'var(--font-mono)',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          background: feedback.type === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(244, 63, 94, 0.15)',
          color: feedback.type === 'success' ? 'var(--accent-emerald)' : 'var(--accent-rose)',
          border: `1px solid ${feedback.type === 'success' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(244, 63, 94, 0.3)'}`
        }}>
          {feedback.type === 'success' ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
          <span>{feedback.msg}</span>
        </div>
      )}

      {/* Pure Direct Login Form */}
      <form onSubmit={handleDirectLogin}>
        <div className="settings-group">
          <label className="settings-label">Username / Email</label>
          <input
            type="text"
            className="input-dense"
            placeholder="trader@exchange.com"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={isBusy}
            required
            autoComplete="username"
          />
        </div>

        <div className="settings-group">
          <label className="settings-label">Password</label>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <input
              type={showPassword ? 'text' : 'password'}
              className="input-dense"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isBusy}
              style={{ paddingRight: '32px', width: '100%' }}
              required
              autoComplete="current-password"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              style={{
                position: 'absolute',
                right: '8px',
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                padding: 0
              }}
              tabIndex={-1}
              title={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </div>

        <div className="settings-group">
          <label className="settings-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>2FA / TOTP Code</span>
            <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)' }}>Optional / If Enabled</span>
          </label>
          <input
            type="text"
            className="input-dense"
            placeholder="e.g. 123456"
            value={twoFactorCode}
            onChange={(e) => setTwoFactorCode(e.target.value)}
            disabled={isBusy}
            maxLength={8}
            autoComplete="one-time-code"
            style={{ letterSpacing: '2px', fontFamily: 'var(--font-mono)' }}
          />
        </div>

        <div className="settings-group" style={{ marginBottom: '10px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.72rem', color: 'var(--text-muted)', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={rememberSession}
              onChange={(e) => setRememberSession(e.target.checked)}
            />
            Remember Session &amp; Credentials (Auto-Login &amp; Renewal)
          </label>
        </div>

        <button type="submit" className="btn-dense" disabled={isBusy} style={{ fontWeight: 700 }}>
          {isBusy ? 'Authenticating...' : token ? '🔄 Switch Account / Re-Login' : '⚡ Direct Sign In'}
        </button>
      </form>

      {/* Auto-reconnect / silent renewal trigger */}
      {(!token || isExpired) && hasSavedCredentials && (
        <div style={{ marginTop: '10px' }}>
          <button
            type="button"
            className="btn-dense"
            style={{
              background: 'rgba(6, 182, 212, 0.2)',
              color: 'var(--accent-cyan)',
              borderColor: 'rgba(6, 182, 212, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px'
            }}
            disabled={isBusy}
            onClick={async () => {
              if (reauthenticate) {
                const res = await reauthenticate();
                if (res.ok) {
                  setFeedback({ type: 'success', msg: 'Session renewed successfully!' });
                  setTimeout(() => setFeedback(null), 3000);
                } else {
                  setFeedback({ type: 'error', msg: res.error || 'Re-authentication failed' });
                }
              } else {
                handleDirectLogin();
              }
            }}
          >
            <RefreshCw size={12} className={isBusy ? 'spin-icon' : ''} />
            {isBusy ? 'Renewing Session...' : `⚡ Re-Connect as ${username}`}
          </button>
        </div>
      )}

      {token && (
        <div style={{ marginTop: '12px', borderTop: '1px solid var(--border-subtle)', paddingTop: '10px' }}>
          <div className="telemetry-row" style={{ justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ color: 'var(--text-dim)', fontSize: '0.7rem' }}>ACCOUNT:</span>
            <span style={{ color: 'var(--accent-emerald)', fontSize: '0.7rem', fontWeight: 600 }}>{username || 'AUTHENTICATED TRADER'}</span>
          </div>
          <div className="telemetry-row" style={{ justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ color: 'var(--text-dim)', fontSize: '0.7rem' }}>ROLE:</span>
            <span style={{ color: 'var(--accent-cyan)' }}>{role}</span>
          </div>
          <div className="telemetry-row" style={{ justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ color: 'var(--text-dim)', fontSize: '0.7rem' }}>SESSION:</span>
            <span style={{ color: isExpired ? 'var(--accent-rose)' : 'var(--accent-emerald)' }}>
              {isExpired ? 'EXPIRED' : 'ACTIVE ✓'}
            </span>
          </div>
          {payload?.exp && (
            <div className="telemetry-row" style={{ justifyContent: 'space-between', marginBottom: '10px' }}>
              <span style={{ color: 'var(--text-dim)', fontSize: '0.7rem' }}>EXPIRES:</span>
              <span style={{ color: 'var(--text-muted)' }}>
                {new Date(payload.exp).toLocaleTimeString()}
              </span>
            </div>
          )}
          <button className="btn-dense btn-danger" onClick={handleClearAll}>
            Sign Out &amp; Clear Credentials
          </button>
        </div>
      )}
    </div>
  );
});
