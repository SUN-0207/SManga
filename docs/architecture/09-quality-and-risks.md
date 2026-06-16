# 9. Quality Requirements & Risks

> arc42 §9 — the quality goals SManga optimizes for, how the architecture meets them, and the risks / technical debt that are knowingly accepted. The product-level goals are in [§1 Introduction & Goals](01-introduction-and-goals.md); this section is concrete and measurable where possible.

## 9.1 Quality goals (what we optimize for)

| Priority | Quality goal | Scenario |
|---|---|---|
| 1 | **Read performance** | A reader opening a story list or chapter on a residential-ISP-hosted laptop gets a fast first paint and low TTFB, even at ~38k stories / millions of chapters. |
| 2 | **Discoverability / SEO** | Googlebot can crawl all chapter URLs; sitemaps are ingestible by Google Search Console. |
| 3 | **Low operating cost** | Total run cost stays ~$3/mo (laptop electricity + a domain), not a managed-cloud bill. |
| 4 | **Operational simplicity** | A single owner-operator can run, observe, and recover the system without a separate ops team. |
| 5 | **Accessibility** | Keyboard navigation, visible focus rings, 4.5:1 contrast, `prefers-reduced-motion` respected. |

## 9.2 How the architecture meets them

### Read performance

A measured 5-lens performance audit (`docs/superpowers/specs/2026-06-11-performance-remediation-design.md`) drove a 4-phase remediation program. Verified prod deltas:

- **Public browse** `GET /api/v1/stories?limit=24`: **1.19s → 0.30s** TTFB. The list query was reworked from a whole-chapter-table `GROUP BY` subquery to `LEFT JOIN LATERAL` per paginated row, plus a `story(updated_at DESC)` btree index (`story_updated_at_idx`) for early-terminating ORDER BY.
- **Crawl-state counts** `GET /api/v1/stories/count?crawlState=needs-crawl`: **2.45s → 0.24s**, via the partial index `chapter_needs_crawl_idx` (`chapter(story_id) WHERE status IN ('pending','failed')`) turning the EXISTS into an empty-range probe. Four admin count queries per keystroke were consolidated into a single `GET /stories/counts` pass.
- **Edge cache**: covers, sitemaps, and anonymous JSON now serve from Cloudflare with `Cf-Cache-Status: HIT` (~0.15s) — see [§8.3](08-crosscutting-concepts.md#83-caching--cloudflare-edge--http-cache-headers).
- **Frontend code-splitting**: the single 683kB JS chunk was split (TanStack Router `autoCodeSplitting` + vendor `manualChunks`) so the reader entry chunk dropped to ~310kB and admin code no longer ships to every reader or to Googlebot.
- **Reader smoothness**: the scroll-progress bar is an rAF-throttled component owning its own listener; chapter paragraphs/word-count are `useMemo`'d, so scrolling does not re-render the chapter body.
- **Crawler throughput**: the `TokenBucket` thundering-herd bug was fixed (FIFO promise chain), allowing the source rate limit to be restored from a symptom-patched 0.5 rps back to 1 rps; chapter gzip/gunzip moved off the event loop (async `zlib`).

### SEO

`sitemap-chapters.xml` was a single ~23MB / 109k-URL file that timed out GSC and exceeded the 50k-URL sitemap-protocol cap. It was sharded into `sitemap-chapters-{n}.xml` files of ≤10k URLs each (~2MB, ~0.4s), with a `sitemap.xml` index, build-once in-process cache keyed on `MAX(story.updated_at)`, and 304 ETags. GSC accepted the sharded sitemap. SEO routes (`/sitemap*.xml`, `/robots.txt`) are excluded from the global `api` prefix (`apps/api/src/main.ts`).

### Low cost

Self-hosting on a home laptop behind a Cloudflare Tunnel flips the cost from the retired managed-cloud stack (~$5–40/mo) to ~$3/mo electricity, with Cloudflare's free tier absorbing the edge cache + tunnel. See [ADR 0006](../adr/0006-laptop-self-host-cloudflare-tunnel.md).

### Operational simplicity

CI builds images to GHCR and Watchtower auto-pulls on the laptop; migrations run idempotently on every API boot via the entrypoint. Runtime knobs (`app_setting`) and observability (the `/admin/jobs` and `/admin/stories` panels) let one operator drive crawling, retries, and moderation without code changes. See [§7 Deployment View](07-deployment-view.md).

### Accessibility

The design system mandates visible focus rings, cursor-pointer everywhere, 4.5:1 minimum contrast, Lucide icons (no emoji), and `prefers-reduced-motion` handling. Known a11y gaps are tracked in §9.4.

## 9.3 Risks (accepted)

| Risk | Impact | Mitigation / status |
|---|---|---|
| **Residential-ISP single point of failure** | The whole site goes down on a power cut, ISP outage, or laptop reboot. No professional SLA. | Accepted as a hobby tradeoff (ADR 0006). Cloudflare edge cache absorbs reads of already-cached covers/JSON during brief origin blips. |
| **Single environment — no staging** | No PR previews, no pre-merge URL, no rollback-to-staging path. A bad push auto-deploys to prod via Watchtower. | House rule: verify on `localhost` + take a Playwright screenshot before any push. Migrations are idempotent through the drizzle journal. Re-introducing staging would need a different stack. |
| **In-process Bull workers share the event loop with HTTP** | A heavy crawl batch can add 30–100ms reader latency. | async zlib + the FIFO token bucket mitigate; a dedicated worker process is a recorded future follow-up, not done. |
| **Queue flood** (the 2026-06-09 3.7M-job incident) | Redis CPU 100%, crawling stalls. | Structurally guarded: priorities, `assertQueueCapacity`, `enqueueChunked`/`enqueueIdempotent`, bounded `removeOnComplete`/`removeOnFail`, `maxStalledCount: 3` + graceful shutdown. |
| **Restoring rps 1 re-triggers truyenfull 503s** | Crawl failures spike. | Watch the dead-letter panel (transient 503s self-retry); the source rps line can be reverted to 0.5 alone. Smart auto-crawl has an instant kill switch. |
| **`maxmemory noeviction` on Redis under flood** | Writes error rather than evict. | Intentional — bounded-and-erroring beats OOM-killing Postgres. The Phase-3 caps make hitting it unlikely. |
| **Leaked legacy credentials not rotated** | Historical Neon/JWT secrets from the retired cloud stack. | Owner explicitly declined rotation for the retired stack; not a live exposure since that stack is gone. |

## 9.4 Technical debt & parked work

Open items, derived from the project handoff notes (do **not** start these unprompted):

- **Operator host-tuning task pending (laptop only)**: `deploy/home/docker-compose.prod.yml` carries the Phase-4 Postgres/Redis/mem-limit/`NODE_OPTIONS`/`DB_POOL_MAX=25`/`stop_grace_period` tuning (runbook `deploy/PHASE4-HOST-TUNING.md`), but it is applied by the operator on the laptop, not via push. Until applied, prod `DB_POOL_MAX` defaults to 10 (harmless).
- **Smart auto-crawl is installed but OFF by default**: `app_setting.autoCrawlEnabled` defaults to `false`; the feeder is installed-but-idle until the operator flips it on in `/admin/settings`.
- **Dead `autoRefreshConcurrency`**: read by nothing (`@Process` concurrency is static); removing the DTO field 400s against `forbidNonWhitelisted` while the FE still sends it — a coupled FE change is needed for a cosmetic cleanup.
- **5 parked loose ends**: (1) SearchModal a11y polish (`aria-activedescendant`, Shift+Tab focus trap, backdrop focus-visible); (2) orphan `/tim-kiem` route to redirect to `/kham-pha`; (3) GSC sitemap retry (now mostly addressed by sharding); (4) cover-backfill retry (now auto-recovered by the dead-letter feature); (5) SEO Phase 2/3 gated on ~4 weeks of GSC data.
- **Design-system drift**: `design-system/smanga/MASTER.md` describes a palette/fonts that were never implemented (see [§8.7](08-crosscutting-concepts.md#87-theming--design-tokens-frontend)). A redesign is out of scope.

---

**Next:** [§10 Glossary](10-glossary.md) · back to [arc42 index](00-index.md)
