# Cloudflare Cache Rules — smanga.shop (operator runbook)

The `s-maxage` headers shipped in Phase 2 are inert at the edge until these
Cache Rules exist: Cloudflare only edge-caches by default based on file
extension, so extensionless `/api/v1/cover/:id` and `.xml` sitemaps were
measured as `Cf-Cache-Status: DYNAMIC` (every request hit the laptop through
the ~50KB/s tunnel). Create these once in the dashboard.

**Where:** Cloudflare dashboard → select `smanga.shop` → Caching → Cache Rules
→ Create rule. Create them in this order (first match wins, so the bypass is
last).

**Two gotchas learned the hard way:**
- **Wrap every custom expression in outer parentheses** `( … )` — Cloudflare's
  expression editor rejects an unwrapped expression.
- **No `matches` (regex)** — needs a Business plan. **Avoid `ends_with`** too —
  unreliable in the builder. Stick to `starts_with(...)` / `contains(...)`,
  which work on all plans.
- The setting that actually turns caching on is **Cache eligibility →
  "Eligible for cache"** (rules 1–3). Edge TTL only matters once eligible.

---

1. **Covers — cache 1 year**
   - Expression: `(starts_with(http.request.uri.path, "/api/v1/cover/"))`
   - Then: Cache eligibility → **Eligible for cache**; Edge TTL → **"Ignore
     cache-control header and use this TTL"** → `31536000` (1 year);
     Browser TTL → respect origin.

2. **Sitemaps — cache 24h**
   - Expression: `(starts_with(http.request.uri.path, "/sitemap"))`
     (single condition — every sitemap path begins with `/sitemap` and nothing
     else does, so no `ends_with`/regex needed.)
   - Then: **Eligible for cache**; Edge TTL → **"Ignore cache-control header and
     use this TTL"** → `86400` (1 day).

3. **Public reader JSON — respect origin s-maxage**
   - Expression (OR of the public read prefixes; NO cookie clause — `http.cookie`
     isn't reliably available in Cache Rules, and it's redundant, see below):
     ```
     (starts_with(http.request.uri.path, "/api/v1/stories") or starts_with(http.request.uri.path, "/api/v1/chapters/by-slug") or starts_with(http.request.uri.path, "/api/v1/rankings") or starts_with(http.request.uri.path, "/api/v1/search"))
     ```
   - Then: **Eligible for cache**; Edge TTL → **"Use cache-control header if
     present, bypass cache if not"** (do NOT hardcode a TTL).
   - **Why no cookie guard is needed:** the Edge-TTL "bypass if not present" IS
     the guard — only responses that carry a cache header get cached, and
     Phase 2 sends `s-maxage` ONLY on the public reader responses (lists 300s,
     chapter content 86400s). Admin/authed endpoints sharing these prefixes
     (`/stories/:id`, `/stories/storage-stats`, `/stories/:id/chapters`,
     `/stories/counts`) send no cache header → they bypass. The public endpoints
     return identical data for everyone (personalization is under `/api/v1/me/*`,
     which doesn't match), so a shared edge cache can't leak. Cloudflare also
     won't cache any response carrying `Set-Cookie`.

4. **Rest of the API — bypass** (must be last)
   - Expression: `(starts_with(http.request.uri.path, "/api/"))`
   - Then: Cache eligibility → **Bypass cache**.

---

**Verify (after saving — 2nd call should flip to HIT):**

```bash
curl -sI https://smanga.shop/api/v1/cover/<any-story-id> | grep -i cf-cache-status   # 2nd call -> HIT
curl -sI https://smanga.shop/sitemap-chapters-1.xml      | grep -i cf-cache-status   # 2nd call -> HIT
curl -sI "https://smanga.shop/api/v1/stories?limit=24"   | grep -i cf-cache-status   # 2nd anon call -> HIT
curl -sI "https://smanga.shop/api/v1/stories?limit=24" -H "Cookie: jwt=x" | grep -i cf-cache-status  # -> DYNAMIC/BYPASS (must NOT cache)
```

**GSC:** after deploy, in Google Search Console → Sitemaps, remove the old
failing `sitemap-chapters.xml` submission and (re)submit `sitemap.xml` — it now
lists the sharded `sitemap-chapters-N.xml` files (each ≤10k URLs, well under
the 50k protocol cap), so GSC can finally ingest the chapter URLs.
