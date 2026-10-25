import { useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { ForegroundService } from '@capawesome-team/capacitor-android-foreground-service';

/**
 * useForegroundService - Keeps polling thread alive in native Android background.
 * Manages native foreground notification and Screen WakeLock.
 */
export function useForegroundService(isPollingActive) {
  const wakeLockRef = useRef(null);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const manageService = async () => {
      try {
        if (isPollingActive) {
          // 1. Start Android Foreground Service with persistent notification
          await ForegroundService.start({
            id: 7007,
            title: 'Nexus Flow Terminal Active',
            body: 'Monitoring P2P order queue in background',
            smallIcon: 'ic_launcher'
          });

          // 2. Acquire Navigator Wake Lock if supported
          if ('wakeLock' in navigator && !wakeLockRef.current) {
            try {
              wakeLockRef.current = await navigator.wakeLock.request('screen');
            } catch {
              // Ignore wake lock rejection
            }
          }
        } else {
          // Stop service
          await ForegroundService.stop();

          if (wakeLockRef.current) {
            await wakeLockRef.current.release();
            wakeLockRef.current = null;
          }
        }
      } catch (err) {
        console.warn('ForegroundService operation failed:', err);
      }
    };

    manageService();

    return () => {
      if (Capacitor.isNativePlatform()) {
        ForegroundService.stop().catch(() => {});
        if (wakeLockRef.current) {
          wakeLockRef.current.release().catch(() => {});
          wakeLockRef.current = null;
        }
      }
    };
  }, [isPollingActive]);
}
