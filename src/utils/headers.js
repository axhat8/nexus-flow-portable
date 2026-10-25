/**
 * Fixed, stable HTTP headers matching legitimate browser sessions.
 * Never randomizes headers per request to avoid Cloudflare WAF bot flagging.
 */
export const TARGET_ORIGIN = 'https://welcome.p2p-expert-traders.com';
export const TARGET_REFERER = 'https://welcome.p2p-expert-traders.com/pwa/app/buy';

export const BROWSER_FINGERPRINT = {
  'sec-ch-ua': '"Chromium";v="128", "Not;A=Brand";v="24", "Google Chrome";v="128"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
  'sec-fetch-dest': 'empty',
  'sec-fetch-mode': 'cors',
  'sec-fetch-site': 'same-origin'
};

export function stableHeaders(token, isPost = false, cookies = null) {
  const headers = {
    'Accept': 'application/json, text/plain, */*',
    'Origin': TARGET_ORIGIN,
    'Referer': TARGET_REFERER,
    ...BROWSER_FINGERPRINT
  };

  if (token) {
    const cleanToken = token.trim().replace(/^Bearer\s+/i, '').replace(/[\r\n\t\s]/g, '');
    headers['Authorization'] = `Bearer ${cleanToken}`;
  }

  if (cookies && typeof cookies === 'string' && cookies.trim()) {
    headers['x-session-cookie'] = cookies.trim();
  }

  if (isPost) {
    headers['Content-Type'] = 'application/json';
  }

  return headers;
}
