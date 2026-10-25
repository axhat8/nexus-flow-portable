import { useState, useEffect, useCallback } from 'react';
import { edgeBridge } from '../services/edgeBridge.js';

/**
 * useEdgeBridge - React hook to bind any UI component to the Frankfurt HFT Edge Daemon.
 */
export function useEdgeBridge(onEdgeEvent = null) {
  const [state, setState] = useState(() => edgeBridge.getState());

  useEffect(() => {
    edgeBridge.init();

    const unsubscribe = edgeBridge.subscribe((newState, event) => {
      setState(newState);
      if (onEdgeEvent && event) {
        onEdgeEvent(event);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [onEdgeEvent]);

  const setEdgeUrl = useCallback((url) => {
    edgeBridge.setEdgeUrl(url);
  }, []);

  const syncConfig = useCallback(async (config) => {
    return await edgeBridge.syncConfig(config);
  }, []);

  const dispatchManualClaim = useCallback(async (orderId, fiatAmount) => {
    return await edgeBridge.dispatchManualClaim(orderId, fiatAmount);
  }, []);

  const reconnect = useCallback(() => {
    edgeBridge.reconnect();
  }, []);

  const resetEngine = useCallback(async () => {
    return await edgeBridge.resetEngine();
  }, []);

  return {
    edgeUrl: state.edgeUrl,
    isConnected: state.isConnected,
    telemetry: state.telemetry,
    setEdgeUrl,
    syncConfig,
    dispatchManualClaim,
    reconnect,
    resetEngine
  };
}
