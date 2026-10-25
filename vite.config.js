import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import https from 'https';
import fs from 'fs';

// Persistent keep-alive agent to maintain an open TLS connection to Cloudflare
// Eliminates repetitive TLS handshakes that trigger Cloudflare bot-detection heuristics
const persistentAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 300000,
  maxSockets: 256,
  maxFreeSockets: 128,
  timeout: 60000,
  scheduling: 'fifo',
  noDelay: true // Disables Nagle's algorithm - instant TCP frame delivery
});

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'render-edge-url-serve',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url === '/render-edge-url.txt' || req.url === '/api/render-edge-url') {
            try {
              let urlToServe = '';
              if (fs.existsSync('render-edge-url.txt')) {
                urlToServe = fs.readFileSync('render-edge-url.txt', 'utf8').trim();
              } else if (fs.existsSync('public/render-edge-url.txt')) {
                urlToServe = fs.readFileSync('public/render-edge-url.txt', 'utf8').trim();
              }
              res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
              return res.end(urlToServe);
            } catch {}
          }
          next();
        });
      }
    }
  ],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/trade-proxy': {
        target: 'https://welcome.p2p-expert-traders.com',
        changeOrigin: true,
        secure: true,
        agent: persistentAgent,
        rewrite: (path) => path.replace(/^\/trade-proxy/, ''),
        headers: {
          'Origin': 'https://welcome.p2p-expert-traders.com',
          'Referer': 'https://welcome.p2p-expert-traders.com/pwa/app/buy'
        },
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq, req) => {
            const customCookie = req.headers['x-session-cookie'];
            if (customCookie) {
              proxyReq.setHeader('cookie', customCookie);
            } else if (req.headers.cookie) {
              proxyReq.setHeader('cookie', req.headers.cookie);
            }
            // Enforce immediate TCP flush on proxy client socket
            if (proxyReq.socket) {
              proxyReq.socket.setNoDelay(true);
            }
          });

          proxy.on('error', (err, req, res) => {
            if (!res.headersSent && typeof res.writeHead === 'function') {
              res.writeHead(502, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Proxy request error', message: err.message }));
            }
          });
        }
      },
      '/sock': {
        target: 'https://welcome.p2p-expert-traders.com',
        changeOrigin: true,
        ws: true,
        headers: {
          'Origin': 'https://welcome.p2p-expert-traders.com'
        }
      }
    }
  },
  build: {
    target: 'esnext',
    outDir: 'dist'
  }
});
