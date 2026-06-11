# Cloudflare Cache Rules — smanga.shop (operator runbook)

The `s-maxage` headers shipped in Phase 2 are inert at the edge until these
Cache Rules exist: Cloudflare only edge-caches by default based on file
extension, so extensionless `/api/v1/cover/:id` and `.xml` sitemaps were
measured as `Cf-Cache-Status: DYNAMIC` (every request hit the laptop through
the ~50KB/s tunnel). Create these once in the dashboard.

**Where:** Cloudflare dashboard → select `smanga.shop` → Caching → Cache Rules
→ Create rule. Create them in this order (first match wins, so the bypass is
last):

1. **Covers — cache 1 year**
   - When incoming requests match: `URI Path` `starts with` `/api/v1/cover/`
   - Then: Eligible for cache; Edge TTL: "Ignore cache-control header and use this TTL" → `31536000` (1 year); Browser TTL: respect origin.

2. **Sitemaps — cache 24h**
   - `URI Path` `starts with` `/sitemap` AND `URI Path` `ends with` `.xml`
     (do NOT use a `matches` regex — that operator needs a Business plan and
     the expression builder rejects it. Raw expression:
     `starts_with(http.request.uri.path, "/sitemap") and ends_with(http.request.uri.path, ".xml")`)
   - Then: Eligible for cache; Edge TTL: "Ignore cache-control header and use this TTL" → `86400` (1 day).

3. **Public reader JSON (no cookie) — respect origin s-maxage**
   - `URI Path` `starts with` `/api/v1/stories` OR `starts with` `/api/v1/chapters/by-slug`
     OR `starts with` `/api/v1/rankings` OR `starts with` `/api/v1/search`
   - AND `Cookie` `does not contain` `jwt`
   - Then: Eligible for cache; Edge TTL: **"Use cache-control header if present,
     bypass cache if not"** (do NOT hardcode a TTL here — this honors the
     per-endpoint `s-maxage` the API sends: 300s for lists, 86400s for chapter
     content, and admin endpoints that send no cache header safely bypass).
     The no-`jwt`-cookie condition keeps logged-in/admin responses out of the
     shared edge cache.

4. **Rest of the API — bypass**
   - `URI Path` `starts with` `/api/`
   - Then: Bypass cache.

**Verify (after saving):**

```bash
curl -sI https://smanga.shop/api/v1/cover/<any-story-id> | grep -i cf-cache-status   # 2nd call -> HIT
curl -sI https://smanga.shop/sitemap-chapters-1.xml      | grep -i cf-cache-status   # 2nd call -> HIT
curl -sI "https://smanga.shop/api/v1/stories?limit=24"   | grep -i cf-cache-status   # 2nd anon call -> HIT
curl -sI "https://smanga.shop/api/v1/stories?limit=24" -H "Cookie: jwt=x" | grep -i cf-cache-status  # -> DYNAMIC/BYPASS
```

**GSC:** after deploy, in Google Search Console → Sitemaps, remove the old
failing `sitemap-chapters.xml` submission and (re)submit `sitemap.xml` — it now
lists the sharded `sitemap-chapters-N.xml` files (each ≤10k URLs, well under
the 50k protocol cap), so GSC can finally ingest the chapter URLs.
