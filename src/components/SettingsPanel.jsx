import React from 'react';
import { audio } from '../utils/audio';

export const SettingsPanel = React.memo(function SettingsPanel({
  settings,
  onUpdateSettings,
  edgeStatus
}) {
  const handleChange = (key, val) => {
    onUpdateSettings({ ...settings, [key]: val });
  };

  const handleAudioToggle = () => {
    const nextVal = !settings.audioEnabled;
    audio.enabled = nextVal;
    handleChange('audioEnabled', nextVal);
  };

  return (
    <div className="glass-panel settings-panel">
      <div className="panel-header" style={{ padding: '0 0 10px 0' }}>
        <span>Trading Settings & Filters</span>
      </div>

      {/* Simultaneous Accept Limit (1, 2, 3, MAX) */}
      <div className="settings-group" style={{ background: 'rgba(6, 182, 212, 0.05)', padding: '10px', borderRadius: '6px', border: '1px solid rgba(6, 182, 212, 0.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
          <label className="settings-label" style={{ margin: 0, fontWeight: 700, color: 'var(--accent-cyan)' }}>
            🎯 Simultaneous Accept Limit
          </label>
          <span style={{
            fontSize: '0.62rem',
            padding: '2px 8px',
            borderRadius: '4px',
            background: 'rgba(6, 182, 212, 0.15)',
            color: 'var(--accent-cyan)',
            fontWeight: 700
          }}>
            {String(settings.acceptLimit || 'AUTO').toUpperCase().includes('AUTO') || String(settings.acceptLimit).toUpperCase() === 'MAX'
              ? '⚡ AUTO SMART (DYNAMIC / ADAPTIVE)'
              : `MAX ${settings.acceptLimit} IN PROCESSING`}
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
          {[
            { val: '1', label: '1 Order', desc: 'Single (Safe)' },
            { val: '2', label: '2 Orders', desc: 'Dual' },
            { val: '3', label: '3 Orders', desc: 'Triple' },
            { val: 'AUTO', label: 'AUTO smart', desc: 'Default / Adaptive' }
          ].map(opt => {
            const current = String(settings.acceptLimit || 'AUTO').toUpperCase();
            const active = current === opt.val || (opt.val === 'AUTO' && (current === 'MAX' || current === 'AUTO SMART'));
            return (
              <button
                key={opt.val}
                type="button"
                className="btn-dense"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  padding: '6px 4px',
                  borderRadius: '5px',
                  background: active ? 'var(--accent-cyan)' : 'rgba(255, 255, 255, 0.04)',
                  color: active ? '#041017' : 'var(--text-primary)',
                  borderColor: active ? 'var(--accent-cyan)' : 'var(--border-subtle)',
                  fontWeight: active ? 700 : 500,
                  transition: 'all 0.15s ease'
                }}
                onClick={() => handleChange('acceptLimit', opt.val)}
              >
                <span style={{ fontSize: '0.74rem', fontWeight: 700 }}>{opt.label}</span>
                <span style={{ fontSize: '0.55rem', opacity: active ? 0.9 : 0.6, marginTop: '2px' }}>{opt.desc}</span>
              </button>
            );
          })}
        </div>
        <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: '6px', lineHeight: 1.3 }}>
          <strong>AUTO smart (Default)</strong> continuously snipes orders with intelligent real-time cabinet adaptation. Or set a strict cap (1, 2, or 3) to hold claims while orders are in <code>PROCESSING</code>.
        </div>
      </div>

      <div className="settings-group">
        <label className="settings-label">Min Fiat (INR) - Default ₹10,000</label>
        <input
          type="number"
          className="input-dense"
          placeholder="10000"
          value={settings.minAmount ?? '10000'}
          onChange={(e) => handleChange('minAmount', e.target.value)}
        />
      </div>

      <div className="settings-group">
        <label className="settings-label">Max Fiat (INR) - Default ₹100,000</label>
        <input
          type="number"
          className="input-dense"
          placeholder="100000"
          value={settings.maxAmount ?? '100000'}
          onChange={(e) => handleChange('maxAmount', e.target.value)}
        />
        <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
          <button
            type="button"
            className="btn-dense"
            style={{
              fontSize: '0.65rem',
              padding: '5px 10px',
              width: '100%',
              justifyContent: 'center',
              background: 'var(--accent-emerald)',
              color: '#041017',
              fontWeight: 700
            }}
            onClick={() => onUpdateSettings({ ...settings, minAmount: '10000', maxAmount: '100000' })}
            title="Enforces strict standard high-frequency filter (₹10,000–₹100,000)"
          >
            🏆 Standard Filter (₹10,000 – ₹100,000)
          </button>
        </div>
      </div>

      <div className="settings-group" style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '10px' }}>
        <div className="switch-row">
          <span className="settings-label" style={{ margin: 0 }}>Auto-Accept Engine</span>
          <button
            className="btn-dense"
            style={{
              width: 'auto',
              padding: '3px 10px',
              background: settings.autoAccept ? 'var(--accent-emerald)' : '#334155',
              color: settings.autoAccept ? '#041017' : '#94a3b8'
            }}
            onClick={() => handleChange('autoAccept', !settings.autoAccept)}
          >
            {settings.autoAccept ? 'ARMED' : 'DISARMED'}
          </button>
        </div>
      </div>

      <div className="settings-group">
        <div className="switch-row" style={{ alignItems: 'flex-start' }}>
          <div>
            <span className="settings-label" style={{ margin: 0 }}>Payout Win Audio Alert</span>
            <span style={{ fontSize: '0.62rem', color: 'var(--text-dim)', display: 'block', marginTop: '2px' }}>
              Sound plays ONLY when payout is accepted. Payout receive sound is silenced.
            </span>
          </div>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <button
              type="button"
              className="btn-dense"
              style={{ width: 'auto', padding: '3px 8px', fontSize: '0.65rem' }}
              onClick={() => audio.testClaimSound()}
              title="Click to hear the payout accepted chime"
            >
              🔔 TEST
            </button>
            <button
              type="button"
              className="btn-dense"
              style={{
                width: 'auto',
                padding: '3px 10px',
                background: settings.audioEnabled ? 'rgba(16, 185, 129, 0.2)' : 'rgba(100, 116, 139, 0.2)',
                color: settings.audioEnabled ? 'var(--accent-emerald)' : 'var(--text-muted)'
              }}
              onClick={handleAudioToggle}
            >
              {settings.audioEnabled ? 'ENABLED' : 'MUTED'}
            </button>
          </div>
        </div>
      </div>


      <div className="settings-group">
        <div className="switch-row">
          <span className="settings-label" style={{ margin: 0 }}>Auto-Pause on Won</span>
          <button
            type="button"
            className="btn-dense"
            style={{
              width: 'auto',
              padding: '3px 10px',
              background: settings.autoPauseOnWon !== false ? 'rgba(16, 185, 129, 0.25)' : '#334155',
              color: settings.autoPauseOnWon !== false ? 'var(--accent-emerald)' : '#94a3b8',
              borderColor: settings.autoPauseOnWon !== false ? 'rgba(16, 185, 129, 0.4)' : '#475569'
            }}
            onClick={() => handleChange('autoPauseOnWon', settings.autoPauseOnWon === false ? true : false)}
          >
            {settings.autoPauseOnWon !== false ? 'PAUSE ON (SAFE)' : 'CONTINUOUS'}
          </button>
        </div>
        <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginTop: '3px' }}>
          {settings.autoPauseOnWon !== false
            ? 'Pauses bot after a claim win so you can confirm receipt in cabinet.'
            : 'Continuous sniping without pause. Auto-resumes as soon as cabinet settles.'}
        </div>
      </div>

      <div className="settings-group">
        <div className="switch-row">
          <span className="settings-label" style={{ margin: 0 }}>424 Simultaneous Protection</span>
          <span style={{
            fontSize: '0.62rem',
            padding: '2px 8px',
            borderRadius: '4px',
            fontWeight: 700,
            background: 'rgba(16, 185, 129, 0.15)',
            color: 'var(--accent-emerald)',
            border: '1px solid rgba(16, 185, 129, 0.3)'
          }}>
            🛡️ AUTO-RESUME (NON-BLOCKING)
          </span>
        </div>
        <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginTop: '3px' }}>
          Engine never hard-pauses on 424. Verifies cabinet in real-time and auto-resumes sniping when clear.
        </div>
      </div>

      <div className="settings-group">
        <div className="switch-row">
          <span className="settings-label" style={{ margin: 0 }}>Anti-Bot Wire Armor</span>
          <button
            type="button"
            className="btn-dense"
            style={{
              width: 'auto',
              padding: '3px 10px',
              background: settings.humanJitterEnabled !== false ? 'rgba(6, 182, 212, 0.25)' : '#334155',
              color: settings.humanJitterEnabled !== false ? 'var(--accent-cyan)' : '#94a3b8',
              borderColor: settings.humanJitterEnabled !== false ? 'rgba(6, 182, 212, 0.4)' : '#475569'
            }}
            onClick={() => handleChange('humanJitterEnabled', settings.humanJitterEnabled === false ? true : false)}
          >
            {settings.humanJitterEnabled !== false ? 'ESPORTS GAUSSIAN (8-28ms / War Mode)' : '0-RTT RAW WIRE'}
          </button>
        </div>
      </div>

      {/* Anti-Bot Natural Stealth Micro-Breaks */}
      <div className="settings-group">
        <div className="switch-row" style={{ alignItems: 'flex-start' }}>
          <div>
            <span className="settings-label" style={{ margin: 0 }}>Stealth Micro-Breaks</span>
            <span style={{ fontSize: '0.62rem', color: 'var(--text-dim)', display: 'block', marginTop: '2px' }}>
              60-90s natural rest after 3 consecutive wins. Mimics human bank confirmation to prevent bot flags.
            </span>
          </div>
          <button
            type="button"
            className="btn-dense"
            style={{
              width: 'auto',
              padding: '3px 10px',
              whiteSpace: 'nowrap',
              background: settings.humanMicroBreaksEnabled !== false ? 'rgba(16, 185, 129, 0.25)' : '#334155',
              color: settings.humanMicroBreaksEnabled !== false ? 'var(--accent-emerald)' : '#94a3b8',
              borderColor: settings.humanMicroBreaksEnabled !== false ? 'rgba(16, 185, 129, 0.4)' : '#475569'
            }}
            onClick={() => handleChange('humanMicroBreaksEnabled', settings.humanMicroBreaksEnabled === false ? true : false)}
          >
            {settings.humanMicroBreaksEnabled !== false ? 'ENABLED (SAFE)' : 'DISABLED'}
          </button>
        </div>
      </div>

      {/* Capital Safeguard: Daily Volume Quota */}
      <div className="settings-group" style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <label className="settings-label" style={{ margin: 0 }}>Daily Volume Quota (INR)</label>
          <span style={{ fontSize: '0.62rem', color: 'var(--accent-cyan)', fontWeight: 600 }}>
            {Number(settings.dailyQuotaAmount || 0) > 0 ? `Target: ₹${Number(settings.dailyQuotaAmount).toLocaleString()}` : 'Unlimited Cap'}
          </span>
        </div>
        <input
          type="number"
          className="input-dense"
          placeholder="0 (Unlimited)"
          value={settings.dailyQuotaAmount ?? '0'}
          onChange={(e) => handleChange('dailyQuotaAmount', e.target.value)}
          style={{ marginTop: '6px' }}
        />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px', marginTop: '6px' }}>
          {[
            { label: 'Unlimited', val: '0' },
            { label: '₹2L', val: '200000' },
            { label: '₹5L', val: '500000' },
            { label: '₹10L', val: '1000000' }
          ].map((preset) => (
            <button
              key={preset.val}
              type="button"
              className="btn-dense"
              style={{
                fontSize: '0.62rem',
                padding: '3px 4px',
                background: String(settings.dailyQuotaAmount || '0') === preset.val ? 'var(--accent-cyan)' : '#1e293b',
                color: String(settings.dailyQuotaAmount || '0') === preset.val ? '#041017' : 'var(--text-primary)',
                fontWeight: String(settings.dailyQuotaAmount || '0') === preset.val ? '700' : '500'
              }}
              onClick={() => handleChange('dailyQuotaAmount', preset.val)}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <span style={{ fontSize: '0.6rem', color: 'var(--text-dim)', marginTop: '4px', display: 'block' }}>
          Auto-pauses engine upon reaching target volume to safeguard bank limits and prevent audit velocity flags.
        </span>
      </div>

      {/* Deadman Consecutive Error Safeguard */}
      <div className="settings-group">
        <label className="settings-label">Deadman Error Safeguard (Max Consecutive Faults)</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px' }}>
          {[
            { label: '3 Faults (Strict)', val: 3 },
            { label: '4 Faults (Safe)', val: 4 },
            { label: '6 Faults (Loose)', val: 6 }
          ].map((item) => (
            <button
              key={item.val}
              type="button"
              className="btn-dense"
              style={{
                fontSize: '0.65rem',
                padding: '4px',
                background: (Number(settings.maxConsecutiveErrors) || 4) === item.val ? 'var(--accent-emerald)' : '#1e293b',
                color: (Number(settings.maxConsecutiveErrors) || 4) === item.val ? '#041017' : 'var(--text-primary)',
                fontWeight: (Number(settings.maxConsecutiveErrors) || 4) === item.val ? '700' : '500'
              }}
              onClick={() => handleChange('maxConsecutiveErrors', item.val)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <span style={{ fontSize: '0.6rem', color: 'var(--text-dim)', marginTop: '4px', display: 'block' }}>
          Auto-pauses if consecutive claims are rejected. Eliminates hammer bans when platform or session is contested.
        </span>
      </div>

      <div className="telemetry-row" style={{ justifyContent: 'space-between', paddingTop: '6px' }}>
        <span style={{ color: 'var(--text-dim)', fontSize: '0.7rem' }}>EXECUTION MODE:</span>
        <span style={{ color: edgeStatus?.isConnected ? 'var(--accent-emerald)' : 'var(--accent-amber)', fontWeight: 600 }}>
          {edgeStatus?.isConnected ? 'FRANKFURT 0-RTT WIRE' : 'CLOUD EDGE DISCONNECTED'}
        </span>
      </div>
    </div>
  );
});
