# page-cloner-proxy (Cloudflare Worker)

The CORS proxy that makes Page Cloner work. Browsers block cross-origin `fetch`,
and every free public CORS proxy is now either dead, rate-limited, or paid-only —
so this Worker is the load-bearing piece, not a nicety.

- **Worker name**: `page-cloner-proxy`
- **URL**: `https://page-cloner-proxy.ferchonaso.workers.dev/?url=<encoded target>`
- **Source of truth**: `worker.mjs` in this folder (keep it in sync with what's deployed)

## Origin lock — read this before adding a domain

The Worker is deliberately **not** an open proxy. It only answers requests whose
`Origin` is in the allowlist; everything else gets `403 Forbidden origin`.

Currently allowed:

| Rule | Matches |
|---|---|
| `ALLOWED_PREFIXES` | `https://ferchonaso13.github.io`, `http://localhost*`, `http://127.0.0.1*` |
| `ALLOWED_SUFFIXES` | `*fernandos-projects-960bd7e4.vercel.app` (Vercel team prod + previews) |
| `ALLOWED_PATTERNS` | `https://page-cloner*.vercel.app` (e.g. `page-cloner-one.vercel.app`) |

**If you put the app on a new domain, add it here and redeploy — otherwise the app
fails with "All CORS proxies failed" and nothing else will explain why.**

## Deploy

Edit `worker.mjs`, then upload it (no wrangler install required):

```bash
printf '{"main_module":"worker.mjs","compatibility_date":"2026-01-01"}' > /tmp/metadata.json

curl -X PUT \
  -H "Authorization: Bearer $CF_API_TOKEN" \
  -F 'metadata=@/tmp/metadata.json;type=application/json' \
  -F 'worker.mjs=@worker.mjs;type=application/javascript+module' \
  "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/workers/scripts/page-cloner-proxy"
```

Uploading auto-deploys the new version at 100%.

## Verifying

Cloudflare's edge caches responses, so a fresh deploy can still serve the old
verdict for a minute. Always test with a cache-busting query param:

```bash
ENC=$(python3 -c "import urllib.parse;print(urllib.parse.quote('https://example.com/',safe=''))")
curl -s -o /dev/null -w '%{http_code}\n' \
  -H "Origin: https://page-cloner-one.vercel.app" \
  "https://page-cloner-proxy.ferchonaso.workers.dev/?url=$ENC&cb=$RANDOM"
```

Expect `200` for an allowed origin and `403` for anything else.
