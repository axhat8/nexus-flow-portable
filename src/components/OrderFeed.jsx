import React, { useMemo } from 'react';

export const OrderFeed = React.memo(function OrderFeed({
  orders = [],
  onClaimOrder,
  isClaimingId = null,
  settings = {},
  token = null,
  isExpired = false,
  isPolling = true,
  onInjectSample = null
}) {
  const formatTime = (ts) => {
    if (!ts) return '--:--:--';
    const d = new Date(ts);
    if (isNaN(d.getTime())) return '--:--:--';
    return d.toLocaleTimeString([], { hour12: false }) + '.' + String(d.getMilliseconds()).padStart(3, '0');
  };

  const formatAmount = (order) => {
    const raw = order.fiatAmount || order.buyAmount || order.amount || 0;
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2
    }).format(raw);
  };

  const getMethodName = (payMethod) => {
    if (!payMethod) return 'IMPS';
    if (typeof payMethod === 'string') return payMethod.replace('DICTIONARY_PAY_METHOD_', '');
    if (payMethod.name) return payMethod.name.replace('DICTIONARY_PAY_METHOD_', '');
    return 'IMPS';
  };

  const minAmt = Number(settings?.minAmount || 0);
  const maxAmt = Number(settings?.maxAmount || 0);

  const sortedOrders = useMemo(() => {
    return [...orders].sort((a, b) => {
      // Keep PROCESSING orders at the very top so trader sees confirmed claims immediately
      if (a.status === 'PROCESSING' && b.status !== 'PROCESSING') return -1;
      if (b.status === 'PROCESSING' && a.status !== 'PROCESSING') return 1;
      // Then sort by timestamp descending
      const timeA = new Date(a.created || a.createdAt || 0).getTime();
      const timeB = new Date(b.created || b.createdAt || 0).getTime();
      return timeB - timeA;
    });
  }, [orders]);

  return (
    <div className="glass-panel feed-panel">
      <div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <span>Live Order Feed ({orders.length} in queue)</span>
          <span style={{ fontSize: '0.68rem', color: 'var(--text-dim)', textTransform: 'none', marginLeft: '10px' }}>
            Filter: ₹{minAmt.toLocaleString()} – ₹{maxAmt.toLocaleString()}
          </span>
        </div>
        {onInjectSample && (
          <button
            type="button"
            className="btn-dense"
            style={{
              width: 'auto',
              padding: '3px 10px',
              fontSize: '0.65rem',
              background: 'rgba(6, 182, 212, 0.15)',
              color: 'var(--accent-cyan)',
              border: '1px solid rgba(6, 182, 212, 0.3)'
            }}
            onClick={onInjectSample}
            title="Inject a test order to verify UI rendering and auto-claim mechanics"
          >
            🧪 Simulate Test Order
          </button>
        )}
      </div>

      <div className="table-wrapper">
        <table className="order-table">
          <colgroup>
            <col style={{ width: '13%' }} />
            <col style={{ width: '12%' }} />
            <col style={{ width: '10%' }} />
            <col style={{ width: '14%' }} />
            <col style={{ width: '17%' }} />
            <col style={{ width: '14%' }} />
            <col style={{ width: '11%' }} />
            <col style={{ width: '9%' }} />
          </colgroup>
          <thead>
            <tr>
              <th>TIME</th>
              <th>ORDER ID</th>
              <th>METHOD</th>
              <th>AMOUNT</th>
              <th>BENEFICIARY</th>
              <th>ACCOUNT</th>
              <th>STATUS / TARGET</th>
              <th style={{ textAlign: 'right' }}>ACTION</th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: '0' }}>
                  {!token ? (
                    <div style={{ padding: '36px 20px' }}>
                      <div style={{ fontSize: '1.8rem', marginBottom: '8px' }}>🔐</div>
                      <div style={{ color: 'var(--accent-amber)', fontWeight: 700, fontSize: '0.92rem', marginBottom: '6px' }}>
                        NO TRADER SESSION CONNECTED
                      </div>
                      <div style={{ color: 'var(--text-dim)', fontSize: '0.78rem', maxWidth: '440px', margin: '0 auto 12px', lineHeight: 1.5 }}>
                        Payout orders cannot load without authentication. Please paste your Bearer token or cURL from DevTools in the right panel, or use <b>Direct Login</b>.
                      </div>
                    </div>
                  ) : isExpired ? (
                    <div style={{ padding: '36px 20px' }}>
                      <div style={{ fontSize: '1.8rem', marginBottom: '8px' }}>⚠️</div>
                      <div style={{ color: 'var(--accent-rose)', fontWeight: 700, fontSize: '0.92rem', marginBottom: '6px' }}>
                        SESSION EXPIRED (HTTP 401 UNAUTHORIZED)
                      </div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem', maxWidth: '460px', margin: '0 auto 12px', lineHeight: 1.5 }}>
                        The server rejected your token because it has expired. Please copy a fresh cURL / Bearer token from the exchange's Network tab and paste it into the <b>Session & Credentials</b> panel.
                      </div>
                    </div>
                  ) : (
                    <div style={{ padding: '36px 20px' }}>
                      <div style={{ fontSize: '1.6rem', marginBottom: '8px' }}>⚡</div>
                      <div style={{ color: 'var(--accent-cyan)', fontWeight: 700, fontSize: '0.88rem', marginBottom: '6px' }}>
                        {isPolling ? '⚡ HYBRID WIRE STREAM ACTIVE (0-RTT)' : '⏹ HYBRID WIRE ENGINE PAUSED'}
                      </div>
                      <div style={{ color: 'var(--text-dim)', fontSize: '0.78rem', maxWidth: '460px', margin: '0 auto', lineHeight: 1.5 }}>
                        Pure Wire Execution Mode active. Real-time DRWS push streams &amp; Triple HTTP/2 multiplexed socket pool listening for orders directly on the wire with sub-millisecond dispatch.
                      </div>
                    </div>
                  )}
                </td>
              </tr>
            ) : (
              sortedOrders.map((order) => {
                const id = order.id || order._id || order.orderId;
                const status = (order.status || 'NEW').toUpperCase();
                const requisites = order.requisites || {};
                const isClaiming = isClaimingId === id;

                const rawAmt = Number(order.fiatAmount || order.buyAmount || order.amount || 0);
                const isAutoTarget = (minAmt <= 0 || rawAmt >= minAmt) && (maxAmt <= 0 || rawAmt <= maxAmt);

                return (
                  <tr key={id} className="order-row row-new">
                    <td style={{ color: 'var(--text-dim)' }}>{formatTime(order.created || order.createdAt)}</td>
                    <td style={{ color: 'var(--accent-cyan)' }}>{String(id).slice(0, 8)}...</td>
                    <td>{getMethodName(order.payMethod)}</td>
                    <td className="amount-badge" style={{ color: isAutoTarget ? 'var(--accent-cyan)' : '#e2e8f0' }}>
                      {formatAmount(order)}
                    </td>
                    <td>{requisites.name || 'ANONYMOUS'}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{requisites.accountNumber || requisites.account || '--'}</td>
                    <td>
                      <span className={`status-badge ${status === 'NEW' ? 'status-new' : status === 'TAKEN' ? 'status-taken' : 'status-processing'}`} style={status === 'TAKEN' ? { background: 'rgba(239, 68, 68, 0.2)', color: 'var(--accent-rose)', borderColor: 'rgba(239, 68, 68, 0.35)' } : {}}>
                        {status}
                      </span>
                      {isAutoTarget ? (
                        <span className="status-badge" style={{ marginLeft: '4px', background: 'rgba(6, 182, 212, 0.2)', color: 'var(--accent-cyan)', border: '1px solid rgba(6, 182, 212, 0.4)' }}>
                          AUTO-TARGET
                        </span>
                      ) : (
                        <span className="status-badge" style={{ marginLeft: '4px', background: 'rgba(148, 163, 184, 0.1)', color: 'var(--text-dim)', border: '1px solid rgba(148, 163, 184, 0.2)' }}>
                          MANUAL
                        </span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        className="btn-claim"
                        disabled={isClaiming || status !== 'NEW' || !token || isExpired}
                        onClick={() => onClaimOrder(order)}
                        title={!token ? 'Authentication required' : isExpired ? 'Token expired' : status === 'TAKEN' ? 'Order won by competitor' : ''}
                        style={status === 'PROCESSING' ? { opacity: 0.65, cursor: 'default' } : status === 'TAKEN' ? { opacity: 0.45, cursor: 'not-allowed', background: 'rgba(239, 68, 68, 0.15)', color: 'var(--accent-rose)', borderColor: 'rgba(239, 68, 68, 0.3)' } : {}}
                      >
                        {isClaiming ? 'CLAIMING...' : status === 'PROCESSING' ? 'ACTIVE' : status === 'TAKEN' ? 'TAKEN' : 'CLAIM'}
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
});
