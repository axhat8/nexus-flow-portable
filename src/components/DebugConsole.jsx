import React, { useState, useEffect, useRef } from 'react';
import { logger } from '../utils/logger';

export function DebugConsole({ isOpen, onToggle }) {
  const [logs, setLogs] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [copied, setCopied] = useState(false);
  const listRef = useRef(null);

  useEffect(() => {
    // Lazy on-demand subscription: only subscribe when the debug drawer is open.
    // When closed, unregisters listener so React performs 0 background re-renders!
    if (!isOpen) return;

    // Immediately load current buffer when opened asynchronously
    const timer = setTimeout(() => {
      setLogs([...logger.buffer]);
    }, 0);

    const unsubscribe = logger.subscribe((newLogs) => {
      setLogs(newLogs);
    });
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [logs, isOpen]);

  const handleCopy = async () => {
    const text = logger.exportText();
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        // Fallback for non-https or older browser contexts
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      alert('Failed to copy automatically. Please select text manually.');
    }
  };

  const filteredLogs = logs.filter((item) => {
    if (filter === 'ALL') return true;
    if (filter === 'EDGE') return item.category.includes('EDGE');
    if (filter === 'WS') return item.category.startsWith('WS');
    if (filter === 'CLAIM') return item.category.includes('CLAIM');
    if (filter === 'POLL') return item.category.startsWith('POLL');
    if (filter === 'ERROR') return item.type === 'error' || item.type === 'warn';
    return true;
  });

  return (
    <div className={`debug-console-drawer ${isOpen ? 'open' : 'closed'}`}>
      {/* Console Bar / Header */}
      <div className="debug-console-header" onClick={onToggle}>
        <div className="debug-header-left">
          <span className="debug-title">🛠️ LIVE DEBUG & TELEMETRY LOGS</span>
          <span className="debug-counter">{logs.length} events</span>
        </div>
        <div className="debug-header-right" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            className="btn-copy-logs"
            onClick={handleCopy}
            title="Copy entire log history to clipboard to share with AI or support"
          >
            {copied ? '✓ COPIED TO CLIPBOARD!' : '📋 COPY ALL LOGS'}
          </button>
          <button
            type="button"
            className="btn-toggle-drawer"
            onClick={onToggle}
          >
            {isOpen ? '▼ HIDE' : '▲ EXPAND LOGS'}
          </button>
        </div>
      </div>

      {/* Expanded Console Body */}
      {isOpen && (
        <div className="debug-console-body">
          {/* Controls Bar */}
          <div className="debug-controls-bar">
            <div className="debug-filters">
              {['ALL', 'EDGE', 'WS', 'CLAIM', 'POLL', 'ERROR'].map((cat) => (
                <button
                  key={cat}
                  type="button"
                  className={`btn-filter ${filter === cat ? 'active' : ''}`}
                  onClick={() => setFilter(cat)}
                >
                  {cat}
                </button>
              ))}
            </div>

            <div className="debug-actions">
              <button
                type="button"
                className="btn-clear-logs"
                onClick={() => logger.clear()}
              >
                CLEAR
              </button>
            </div>
          </div>

          {/* Log Stream */}
          <div className="debug-log-list" ref={listRef}>
            {filteredLogs.length === 0 ? (
              <div className="debug-empty-text">No events logged for filter "{filter}" yet. Logs appear here in real-time.</div>
            ) : (
              filteredLogs.map((log) => (
                <div key={log.id} className={`debug-log-row log-${log.type}`}>
                  <span className="log-time">{log.timestamp}</span>
                  <span className={`log-cat cat-${log.category.toLowerCase().replace(/[^a-z0-9]/g, '-')}`}>[{log.category}]</span>
                  <span className="log-msg">{log.message}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
