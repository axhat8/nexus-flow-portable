import { Capacitor, CapacitorHttp } from '@capacitor/core';

/**
 * Unified HTTP transport supporting both Browser (fetch + credentials)
 * and Native Android (CapacitorHttp bypassing WebView restrictions).
 * 
 * Returns normalized shape:
 * { ok: boolean, status: number, headers: Record<string, string>, body: any }
 */
function normalizeHeaders(headers) {
  const normalized = {};
  normalized.get = (name) => normalized[name?.toLowerCase()] ?? null;
  if (!headers) return normalized;

  if (typeof headers.forEach === 'function') {
    headers.forEach((val, key) => {
      normalized[key.toLowerCase()] = val;
    });
  } else if (typeof headers === 'object') {
    for (const [k, v] of Object.entries(headers)) {
      normalized[k.toLowerCase()] = v;
    }
  }
  return normalized;
}

export async function unifiedFetch({ url, method = 'GET', headers = {}, body = null }) {
  const isNative = Capacitor.isNativePlatform();

  if (isNative) {
    try {
      const options = {
        url,
        method: method.toUpperCase(),
        headers: { ...headers }
      };

      if (body !== null && body !== undefined) {
        if (typeof body === 'string') {
          try {
            options.data = JSON.parse(body);
          } catch {
            options.data = body;
          }
        } else {
          options.data = body;
        }
      }

      const response = await CapacitorHttp.request(options);
      
      let parsedBody = response.data;
      if (typeof parsedBody === 'string') {
        try {
          parsedBody = JSON.parse(parsedBody);
        } catch {
          // Keep as string if not JSON
        }
      }

      const status = response.status || 0;
      const ok = status >= 200 && status < 300;

      return {
        ok,
        status,
        headers: normalizeHeaders(response.headers),
        body: parsedBody
      };
    } catch (err) {
      return {
        ok: false,
        status: err.status || 0,
        headers: normalizeHeaders(),
        body: { error: err.message || 'Native transport request failed' }
      };
    }
  } else {
    // Browser environment
    const fetchOptions = {
      method: method.toUpperCase(),
      credentials: 'include',
      headers: { ...headers }
    };

    if (body !== null && body !== undefined && method.toUpperCase() !== 'GET' && method.toUpperCase() !== 'HEAD') {
      fetchOptions.body = typeof body === 'object' ? JSON.stringify(body) : body;
    }

    try {
      const response = await window.fetch(url, fetchOptions);
      const resHeaders = normalizeHeaders(response.headers);
      
      if (response.ok) {
        // Fast path for 2xx responses: direct stream JSON parsing without string buffering
        const parsedBody = await response.json().catch(() => null);
        return {
          ok: true,
          status: response.status,
          headers: resHeaders,
          body: parsedBody
        };
      }

      // Error path (429, 401, 5xx): extract headers and error payload
      let parsedBody;
      const text = await response.text().catch(() => '');
      try {
        parsedBody = JSON.parse(text);
      } catch {
        parsedBody = text;
      }

      return {
        ok: false,
        status: response.status,
        headers: resHeaders,
        body: parsedBody
      };
    } catch (err) {
      return {
        ok: false,
        status: 0,
        headers: normalizeHeaders(),
        body: { error: err.message || 'Browser network error' }
      };
    }
  }
}
