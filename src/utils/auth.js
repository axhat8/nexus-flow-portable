/**
 * AUTH & ORDER CLAIM ENGINE
 * 
 * ACCEPT BODY VARIANTS DOCUMENTATION:
 * - Variant A: body null (Content-Length: 0, no Content-Type required). Recommended REST standard for action triggers.
 * - Variant B: body JSON.stringify({}) with Content-Type: application/json. Fallback when server requires JSON parser.
 * - Variant C: body JSON.stringify({ ...fields from detail body... }). Fallback when server requires order verification tokens/payload.
 * 
 * The acceptPayoutOrder function attempts Variant A first, and automatically executes Variant B and C
 * if the target node returns 400 Bad Request, 415 Unsupported Media Type, or 422 Unprocessable Entity.
 */

import { unifiedFetch } from './transport.js';
import { stableHeaders, TARGET_ORIGIN } from './headers.js';
import { Capacitor } from '@capacitor/core';

/**
 * Regex-extract Authorization: Bearer <token> and Cookie: <cookies> from pasted cURL.
 */
export function parseCurlToSession(curlString) {
  if (!curlString || typeof curlString !== 'string') {
    return { token: null, cookies: null };
  }

  const cleaned = curlString.replace(/\r\n/g, ' ').replace(/\n/g, ' ').replace(/\^/g, '');
  let token = null;
  let cookies = null;

  // 1. Extract Bearer token from -H / --header or PowerShell headers
  const authMatch = cleaned.match(/(?:-H|--header)\s+['"]?[Aa]uthorization:\s*(?:Bearer\s+)?([A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+)['"]?/i) ||
                    cleaned.match(/['"]?[Aa]uthorization['"]?\s*[:=]\s*['"]?(?:Bearer\s+)?([A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+)['"]?/i);
  if (authMatch && authMatch[1]) {
    token = authMatch[1].trim();
  } else {
    // Check for raw token paste
    const rawJwtMatch = cleaned.match(/([A-Za-z0-9-_=]{20,}\.[A-Za-z0-9-_=]{20,}\.[A-Za-z0-9-_=]{20,})/);
    if (rawJwtMatch && rawJwtMatch[1]) {
      token = rawJwtMatch[1].trim();
    }
  }

  // 2. Extract Cookie header
  const cookieMatch = cleaned.match(/(?:-H|--header)\s+['"]?[Cc]ookie:\s*([^'"\r\n]+)['"]?/i) ||
                      cleaned.match(/(?:-b|--cookie)\s+['"]?([^'"\r\n]+)['"]?/i) ||
                      cleaned.match(/['"]?[Cc]ookie['"]?\s*[:=]\s*['"]?([^'"\r\n]+)['"]?/i);
  if (cookieMatch && cookieMatch[1]) {
    cookies = cookieMatch[1].trim();
  }

  return { token, cookies };
}

/**
 * Decode JWT payload without verifying signature (safe client-side inspection).
 */
export function decodeJwt(token) {
  if (!token || typeof token !== 'string') return null;
  try {
    const cleanToken = token.trim().replace(/^Bearer\s+/i, '');
    const parts = cleanToken.split('.');
    if (parts.length < 2) return null;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    const parsed = JSON.parse(jsonPayload);

    let exp = null;
    if (parsed.exp) {
      exp = typeof parsed.exp === 'number' ? parsed.exp * 1000 : Date.parse(parsed.exp);
    } else if (parsed.expires) {
      const cleanExpires = typeof parsed.expires === 'string' ? parsed.expires.replace(/\[.*\]/, '') : parsed.expires;
      exp = Date.parse(cleanExpires);
    }

    let iat = null;
    if (parsed.iat) {
      iat = typeof parsed.iat === 'number' ? parsed.iat * 1000 : Date.parse(parsed.iat);
    }

    return {
      ...parsed,
      sub: parsed.sub || null,
      role: parsed.role || parsed.roles || 'ROLE_TRADER',
      exp,
      iat
    };
  } catch {
    return null;
  }
}

/**
 * Translates exchange authentication errors into clear, actionable human messages.
 */
export function mapLoginError(response) {
  const status = response?.status || 0;
  const body = response?.body;
  const rawError = body?.error || '';
  const rawMsg = body?.message || '';

  if (rawError === 'ERROR_INVALID_CREDENTIALS') {
    return 'Invalid username or password. Please verify your credentials.';
  }
  if (rawError === 'ERROR_AUTH_COOLDOWN' || String(rawMsg).toLowerCase().includes('wait before requesting')) {
    return rawMsg || 'Please wait a moment before requesting a new authentication code.';
  }
  if (rawError === 'ERROR_2FA_REQUIRED' || rawError === 'ERROR_INVALID_2FA_CODE' || rawError === 'ERROR_2FA_CODE_REQUIRED') {
    return 'Two-factor authentication code required or incorrect. Please enter your 6-digit TOTP code.';
  }
  if (status === 403 || (typeof body === 'string' && body.includes('Attention Required! | Cloudflare'))) {
    return 'Cloudflare security challenge detected. Please use the "Use cURL / Token" tab to import your browser session.';
  }
  if (rawMsg) return rawMsg;
  if (rawError) return `Authentication failed: ${rawError}`;
  if (status === 417) return 'Authentication expectation failed. Check username and password.';
  if (status === 400) return 'Invalid request format or missing credentials.';
  return `Login failed (HTTP ${status || 'Network Error'})`;
}

/**
 * Direct login via credentials.
 */
export async function login({ username, password, code, useProxy = true }) {
  const isNative = Capacitor.isNativePlatform();
  const baseUrl = useProxy && !isNative
    ? '/trade-proxy/api/login'
    : `${TARGET_ORIGIN}/api/login`;

  const headers = stableHeaders(null, true);
  const bodyData = {
    username: username.trim(),
    password: password
  };
  if (code && typeof code === 'string' && code.trim()) {
    bodyData.code = code.trim();
  }

  const response = await unifiedFetch({
    url: baseUrl,
    method: 'POST',
    headers,
    body: bodyData
  });

  if (!response.ok) {
    const friendlyMsg = mapLoginError(response);
    throw new Error(friendlyMsg);
  }

  let token = null;
  if (typeof response.body === 'string' && response.body.includes('.')) {
    token = response.body.trim();
  } else if (response.body && typeof response.body === 'object') {
    token = response.body.token || response.body.accessToken || response.body.jwt || response.body.id_token || response.body.data?.token;
  }

  if (!token) {
    throw new Error('Authentication succeeded but no token was returned.');
  }

  // Preserve session cookies if returned
  let cookies = null;
  if (response.headers) {
    cookies = response.headers['set-cookie'] || response.headers['x-session-cookie'] || null;
    if (cookies && typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem('nexus_flow_cookies', cookies);
      } catch {}
    }
  }

  return {
    token,
    payload: decodeJwt(token),
    headers: response.headers,
    cookies
  };
}

/**
 * Automatically re-authenticates using saved credentials in localStorage without throwing unhandled UI errors.
 * Returns { ok: boolean, token?: string, error?: string, payload?: object }
 */
export async function silentReauthenticate() {
  if (typeof localStorage === 'undefined') return { ok: false, error: 'No localStorage available' };

  const username = localStorage.getItem('nexus_saved_username');
  const password = localStorage.getItem('nexus_saved_password');

  if (!username || !password) {
    return { ok: false, error: 'No saved credentials found' };
  }

  try {
    const res = await login({ username, password });
    if (res?.token) {
      localStorage.setItem('nexus_flow_token', res.token);
      localStorage.setItem('nexus_active_token', res.token);
      localStorage.setItem('vdesk_auth_token', res.token);
      return { ok: true, token: res.token, payload: res.payload };
    }
    return { ok: false, error: 'No token in re-authentication response' };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Step 1: Pre-requisite GET to acquire order details and server-side state lock.
 */
export async function fetchPayoutDetail({ orderId, token, useProxy = true }) {
  if (!orderId || !token) throw new Error('Missing orderId or token');

  const isNative = Capacitor.isNativePlatform();
  const url = useProxy && !isNative
    ? `/trade-proxy/api/trade-api/trader-cabinet-pwa/payouts/${orderId}`
    : `${TARGET_ORIGIN}/api/trade-api/trader-cabinet-pwa/payouts/${orderId}`;

  const headers = stableHeaders(token, false);
  return await unifiedFetch({
    url,
    method: 'GET',
    headers
  });
}

/**
 * Accept payout order: Single-shot clean claim with null body (Content-Length: 0)
 * matching official PWA Burp Suite verified signature.
 * Disables Variant B/C retries on 400/422 to prevent burning rate limits on already-taken orders.
 */
export async function acceptPayoutOrder({ orderId, token, useProxy = true }) {
  if (!orderId || !token) throw new Error('Missing orderId or token');

  const isNative = Capacitor.isNativePlatform();
  const url = useProxy && !isNative
    ? `/trade-proxy/api/trade-api/trader-cabinet-pwa/payouts/${orderId}/accept`
    : `${TARGET_ORIGIN}/api/trade-api/trader-cabinet-pwa/payouts/${orderId}/accept`;

  // Single-shot Variant A: body null (Content-Length: 0)
  const headers = stableHeaders(token, false);
  return await unifiedFetch({
    url,
    method: 'POST',
    headers,
    body: null
  });
}

/**
 * Chained claim routine: detail -> accept
 */
export async function claimOrder({ orderId, token, useProxy = true }) {
  // Step 1: Detail
  const detailRes = await fetchPayoutDetail({ orderId, token, useProxy });
  if (!detailRes.ok) {
    return {
      ok: false,
      step: 'detail',
      status: detailRes.status,
      detail: detailRes,
      accept: null
    };
  }

  // Step 2: Accept
  const acceptRes = await acceptPayoutOrder({
    orderId,
    token,
    useProxy,
    detail: detailRes
  });

  return {
    ok: acceptRes.ok,
    step: 'accept',
    status: acceptRes.status,
    detail: detailRes,
    accept: acceptRes
  };
}
