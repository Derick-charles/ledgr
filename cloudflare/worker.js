// LEDGR on Cloudflare Workers.
//
// The backend files in netlify/functions/ are written as `handler(event)`
// functions that return { statusCode, headers, body }. This file is the thin
// layer that lets them run on Cloudflare: it turns each web request into that
// "event", calls the right handler, and turns the answer back into a response.
// Web pages (the built app) are served by Cloudflare itself — see [assets] in
// wrangler.toml; only /api/* reaches this code.
import { handler as auth } from '../netlify/functions/auth.js';
import { handler as accounts } from '../netlify/functions/accounts.js';
import { handler as trades } from '../netlify/functions/trades.js';
import { handler as journal } from '../netlify/functions/journal.js';
import { handler as certificates } from '../netlify/functions/certificates.js';
import { handler as checklist } from '../netlify/functions/checklist.js';
import { handler as lessons } from '../netlify/functions/lessons.js';
import { handler as media } from '../netlify/functions/media.js';
import { handler as mistakeTags } from '../netlify/functions/mistake-tags.js';
import { handler as poiTags } from '../netlify/functions/poi-tags.js';
import { handler as backup } from '../netlify/functions/backup.js';
import { handler as backtests } from '../netlify/functions/backtests.js';
import { handler as sync } from '../netlify/functions/sync.js';
import { handler as merge } from '../netlify/functions/merge.js';

const ROUTES = {
  auth, accounts, trades, journal, certificates, checklist, lessons, media,
  'mistake-tags': mistakeTags, 'poi-tags': poiTags, backup, backtests, sync, merge,
};

const jsonResponse = (status, data) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

async function toEvent(request, url) {
  const headers = {};
  request.headers.forEach((value, name) => { headers[name.toLowerCase()] = value; });
  const method = request.method.toUpperCase();
  const body = method === 'GET' || method === 'HEAD' ? null : await request.text();
  return {
    httpMethod: method,
    path: url.pathname,
    headers,
    queryStringParameters: Object.fromEntries(url.searchParams),
    body: body || null,
    isBase64Encoded: false,
  };
}

function toResponse(result) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(result.headers || {})) headers.set(name, String(value));
  let body = result.body ?? null;
  if (result.isBase64Encoded && typeof body === 'string') {
    const bin = atob(body);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    body = bytes;
  }
  return new Response(result.statusCode === 204 ? null : body, { status: result.statusCode || 200, headers });
}

export default {
  async fetch(request, env, ctx) {
    globalThis.__LEDGR_ENV = env; // the storage layer reads its D1/R2 bindings from here
    const url = new URL(request.url);
    const match = /^\/(?:api|\.netlify\/functions)\/([a-z-]+)\/?$/.exec(url.pathname);
    if (!match) {
      // Not an API call — hand it to the static site (normally Cloudflare does this itself).
      return env.ASSETS ? env.ASSETS.fetch(request) : jsonResponse(404, { error: 'Not found' });
    }
    const handler = ROUTES[match[1]];
    if (!handler) return jsonResponse(404, { error: 'Not found' });
    try {
      return toResponse(await handler(await toEvent(request, url), {}));
    } catch (e) {
      console.error('[worker]', e);
      return jsonResponse(500, { error: e.message || 'Server error' });
    }
  },
};
