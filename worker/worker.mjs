// CORS proxy for the Page Cloner GitHub Pages app.
// Locked to the cloner's own origins so it can't be abused as an open proxy.
const ALLOWED_PREFIXES = [
  'https://ferchonaso13.github.io',
  'http://localhost',
  'http://127.0.0.1',
];
// Vercel production + preview deploys for this team (unique team suffix).
const ALLOWED_SUFFIXES = [
  'fernandos-projects-960bd7e4.vercel.app',
];
// Any Vercel alias of this project: page-cloner.vercel.app, page-cloner-one.vercel.app,
// page-cloner-git-<branch>-....vercel.app. Kept prefix-anchored so it is not an open proxy.
const ALLOWED_PATTERNS = [
  /^https:\/\/page-cloner[a-z0-9-]*\.vercel\.app$/,
];
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Max-Age': '86400',
  };
}
function allowed(origin) {
  if (!origin) return true; // same-origin / no-Origin (e.g. direct nav) — harmless GETs
  const o = origin.toLowerCase();
  if (ALLOWED_PREFIXES.some((p) => o === p || o.startsWith(p + ':'))) return true;
  if (ALLOWED_SUFFIXES.some((s) => o === 'https://' + s || o.endsWith('.' + s) || o.endsWith('-' + s) || o.endsWith(s))) return true;
  if (ALLOWED_PATTERNS.some((re) => re.test(o))) return true;
  return false;
}

export default {
  async fetch(request) {
    const origin = request.headers.get('Origin') || '';
    const echo = allowed(origin) ? (origin || '*') : 'https://ferchonaso13.github.io';
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(echo) });
    }
    if (origin && !allowed(origin)) {
      return new Response('Forbidden origin', { status: 403, headers: corsHeaders(echo) });
    }
    const target = new URL(request.url).searchParams.get('url');
    if (!target) {
      return new Response('Missing ?url=', { status: 400, headers: corsHeaders(echo) });
    }
    let t;
    try { t = new URL(target); } catch { return new Response('Bad url', { status: 400, headers: corsHeaders(echo) }); }
    if (t.protocol !== 'http:' && t.protocol !== 'https:') {
      return new Response('Bad protocol', { status: 400, headers: corsHeaders(echo) });
    }
    try {
      const upstream = await fetch(target, { headers: { 'User-Agent': UA, 'Accept': '*/*' }, redirect: 'follow' });
      const headers = new Headers(corsHeaders(echo));
      const ct = upstream.headers.get('content-type');
      if (ct) headers.set('content-type', ct);
      headers.set('cache-control', 'no-store');
      return new Response(upstream.body, { status: upstream.status, headers });
    } catch (e) {
      return new Response('Upstream fetch failed: ' + (e && e.message ? e.message : e), { status: 502, headers: corsHeaders(echo) });
    }
  },
};
