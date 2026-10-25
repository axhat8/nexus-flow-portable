import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { decodeJwt, parseCurlToSession, silentReauthenticate } from '../utils/auth';

const STORAGE_KEY = 'nexus_flow_token';
const COOKIES_KEY = 'nexus_flow_cookies';

const FALLBACK_KEYS = [
  'nexus_flow_token',
  'nexus_active_token',
  'vdesk_auth_token',
  'token',
  'jwt',
  'accessToken',
  'p2p_auth_token'
];

function findStoredToken() {
  if (typeof localStorage === 'undefined') return null;

  // 1. Check known keys
  for (const key of FALLBACK_KEYS) {
    const val = localStorage.getItem(key);
    if (val && typeof val === 'string' && val.includes('.')) {
      return val.trim().replace(/^Bearer\s+/i, '');
    }
  }

  // 2. Check JSON sessions like vdesk_session
  try {
    const rawSession = localStorage.getItem('vdesk_session');
    if (rawSession) {
      const parsed = JSON.parse(rawSession);
      const token = parsed?.token || parsed?.accessToken || parsed?.jwt;
      if (token && typeof token === 'string') {
        return token.trim().replace(/^Bearer\s+/i, '');
      }
    }
  } catch {}

  // 3. Scan all keys for JWT prefix
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    const val = localStorage.getItem(key);
    if (val && typeof val === 'string' && val.startsWith('eyJ') && val.includes('.')) {
      return val.trim().replace(/^Bearer\s+/i, '');
    }
  }

  return null;
}

export function useToken() {
  const [token, setTokenState] = useState(() => {
    return findStoredToken();
  });
  const [isReauthenticating, setIsReauthenticating] = useState(false);
  const reauthTimerRef = useRef(null);

  const setToken = useCallback((newToken, newCookies = null) => {
    if (newToken && typeof newToken === 'string') {
      const clean = newToken.trim().replace(/^Bearer\s+/i, '');
      localStorage.setItem(STORAGE_KEY, clean);
      localStorage.setItem('nexus_active_token', clean);
      localStorage.setItem('vdesk_auth_token', clean);
      if (newCookies) {
        localStorage.setItem(COOKIES_KEY, newCookies);
      }
      setTokenState(clean);
    } else {
      for (const key of FALLBACK_KEYS) {
        localStorage.removeItem(key);
      }
      localStorage.removeItem(COOKIES_KEY);
      localStorage.removeItem('vdesk_session');
      setTokenState(null);
    }
  }, []);

  const importCurl = useCallback((curlString) => {
    const { token: extractedToken, cookies: extractedCookies } = parseCurlToSession(curlString);
    if (extractedToken) {
      setToken(extractedToken, extractedCookies);
      return true;
    }
    return false;
  }, [setToken]);

  const clearToken = useCallback(() => {
    setToken(null);
  }, [setToken]);

  const payload = useMemo(() => {
    return decodeJwt(token);
  }, [token]);

  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 10000);
    return () => clearInterval(timer);
  }, []);

  const isExpired = useMemo(() => {
    if (!payload?.exp) return false;
    return now >= payload.exp;
  }, [payload, now]);

  const role = payload?.role || (token ? 'ROLE_TRADER' : 'NONE');

  const hasSavedCredentials = useMemo(() => {
    try {
      return Boolean(localStorage.getItem('nexus_saved_username') && localStorage.getItem('nexus_saved_password'));
    } catch {
      return false;
    }
  }, []);

  const reauthenticate = useCallback(async () => {
    setIsReauthenticating(true);
    try {
      const res = await silentReauthenticate();
      if (res.ok && res.token) {
        setToken(res.token);
        return { ok: true, token: res.token };
      }
      return { ok: false, error: res.error };
    } finally {
      setIsReauthenticating(false);
    }
  }, [setToken]);

  // Proactive background auto-renewal before token expires
  useEffect(() => {
    if (reauthTimerRef.current) {
      clearTimeout(reauthTimerRef.current);
      reauthTimerRef.current = null;
    }

    if (!token || !payload?.exp || !hasSavedCredentials) return;

    const msUntilExpiry = payload.exp - Date.now();
    // If expired or expiring in < 60 seconds, refresh asynchronously
    if (msUntilExpiry <= 60000) {
      const asyncRenew = setTimeout(() => {
        reauthenticate();
      }, 0);
      return () => clearTimeout(asyncRenew);
    } else {
      // Otherwise schedule renewal 60 seconds before expiration
      const triggerInMs = msUntilExpiry - 60000;
      reauthTimerRef.current = setTimeout(() => {
        reauthenticate();
      }, triggerInMs);
    }

    return () => {
      if (reauthTimerRef.current) {
        clearTimeout(reauthTimerRef.current);
      }
    };
  }, [token, payload?.exp, hasSavedCredentials, reauthenticate]);

  return {
    token,
    payload,
    isExpired,
    role,
    setToken,
    importCurl,
    clearToken,
    reauthenticate,
    isReauthenticating,
    hasSavedCredentials
  };
}
