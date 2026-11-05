// start-platform.mjs — single-service launcher.
//
// Runs the whole platform inside ONE Render web service:
//   1. the PrimeStack Fastify API (src/ → dist/server.js) on an internal port
//   2. the operator console (start-dashboard.js) on the public PORT
//
// The console proxies every /api/* call to the internal API, signing the
// request with the console HMAC key and replaying the operator session.
import { setTimeout as delay } from 'node:timers/promises';

const PUBLIC_PORT = process.env.PORT || '3000';
const API_PORT = process.env.API_PORT || '8081';

// The console reads these at import time.
process.env.API_PORT = API_PORT;
process.env.PRIMESTACK_API_URL = process.env.PRIMESTACK_API_URL || `http://127.0.0.1:${API_PORT}`;

// The API resolves its listen port from PORT — set it before importing.
process.env.PORT = API_PORT;
await import('./dist/server.js');
console.log(`[platform] Fastify API starting on internal port ${API_PORT}`);

async function waitForApi(attempts = 40) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${API_PORT}/health`);
      if (res.ok) return true;
    } catch { /* not listening yet */ }
    await delay(500);
  }
  return false;
}

// Payment rails service (Wise pass-through) — in-memory, no database.
const RAILS_PORT = process.env.RAILS_PORT || '8082';
process.env.RAILS_PORT = RAILS_PORT;
await import('./rails-service.js');
console.log(`[platform] Payment rails service on 127.0.0.1:${RAILS_PORT}`);

const apiReady = await waitForApi();
console.log(apiReady
  ? '[platform] API health check passed'
  : '[platform] WARNING: API did not answer /health — starting console anyway');

// Hand PORT back to the console.
process.env.PORT = PUBLIC_PORT;
await import('./start-dashboard.js');
