# ADR 0005 — Store cover images as `bytea` in Postgres (no object storage)

- **Status:** Accepted
- **Date:** 2026-05-28 (Plan 1 foundation)
- **Sources:** `CLAUDE.md` § "Architectural decisions (the why)"; `packages/db/src/migrations/0001_pale_salo.sql` (creates the `story` table with the `cover` `bytea` + `cover_mime_type` columns — `0000_conscious_skreet.sql` defines only the enums and the `source` table); `apps/api/src/modules/covers/covers.controller.ts`.

## Context

Each story has a cover image (a small JPEG, typically ~50 KB). A reader catalog of ~500 stories means roughly ~25 MB of cover data. The covers must be served fast to anonymous readers and must survive backups alongside the rest of the data. The deployment is a single self-hosted laptop ([ADR 0006](0006-laptop-self-host-cloudflare-tunnel.md)) behind Cloudflare, with no separate object-storage service in the runtime.

## Decision

Store the cover bytes **inline in Postgres** on the `story` table:

- `story.cover` — `bytea` (the image bytes, downloaded by the crawler).
- `story.cover_mime_type` — `text` (defaults to `image/jpeg` when serving if null).

Serve them from a dedicated endpoint, `GET /api/v1/cover/:storyId` (`covers.controller.ts`), which:

- returns 404 when there is no cover,
- computes a strong **ETag** as the SHA-1 of the bytes and honours `If-None-Match` (304),
- sets `Cache-Control: public, max-age=31536000, immutable`,

so Cloudflare's edge cache absorbs the load and clients revalidate cheaply.

## Consequences

**Easier**

- **Operational simplicity**: one system of record, one backup target (`pg_dump`). No second service, no CDN sync, no bucket credentials.
- Covers are transactionally consistent with their story and travel with every backup/restore.
- The `immutable` + long-`max-age` + ETag headers let Cloudflare serve covers from the edge (`Cf-Cache-Status: HIT`), so the origin rarely re-reads the blob.

**Harder / trade-offs**

- Cover bytes live in the relational DB and inflate `pg_dump` size; this is bounded by Cloudflare Tunnel TOS to **text + small JPEG covers only** (no video/large-file mirroring).
- Serving large binaries from Postgres would not scale; this works only because covers are small and edge-cached.

## Alternatives considered

- **Object storage / CDN (S3, R2)** — rejected for the runtime. It would add a service and credentials for ~25 MB of data; the chosen approach trades a theoretical CDN-origin for simplicity, and Cloudflare's edge cache already provides the CDN benefit in front of the bytea endpoint.
- **Filesystem on the laptop** — rejected; would not travel with the DB backup and complicates the stateless container model.
