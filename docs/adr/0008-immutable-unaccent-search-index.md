# ADR 0008 — `immutable_unaccent` wrapper + GIN trigram index for Vietnamese search

- **Status:** Accepted
- **Date:** 2026-05-28 (Plan 1 foundation)
- **Sources:** `CLAUDE.md` workarounds #3, #13; migration `packages/db/src/migrations/0001_pale_salo.sql`; `apps/api/src/modules/stories/stories.service.ts` (search clause).

## Context

Vietnamese readers search without diacritics and expect accent-insensitive, fuzzy matching (e.g. typing `tien` should match `Tiên`). PostgreSQL provides `unaccent()` (strips diacritics) and `pg_trgm` (trigram similarity / `ILIKE` acceleration via a GIN index).

The obstacle: a GIN expression index must be built over an **`IMMUTABLE`** function, but PostgreSQL's built-in `unaccent()` is declared **`STABLE`** (its result can depend on the loaded dictionary). So `CREATE INDEX ... (unaccent(...))` is rejected — the index can't reference a `STABLE` function.

## Decision

Define an **`IMMUTABLE` SQL wrapper** in migration `0001_pale_salo.sql`:

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE OR REPLACE FUNCTION immutable_unaccent(text)
  RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT AS
$func$
SELECT public.unaccent('public.unaccent', $1)
$func$;
```

Build a GIN trigram index over the normalized, lower-cased title + author:

```sql
CREATE INDEX story_search_idx ON story
  USING gin (immutable_unaccent(lower(title || ' ' || coalesce(author, ''))) gin_trgm_ops);
```

Query with the **same wrapper expression on both sides** so the index is used (`apps/api/src/modules/stories/stories.service.ts`):

```sql
AND immutable_unaccent(lower(s.title || ' ' || COALESCE(s.author,'')))
    ILIKE '%' || immutable_unaccent(lower($q)) || '%'
```

## Consequences

**Easier**

- Accent-insensitive, case-insensitive substring search over title+author, accelerated by the GIN trigram index — no external search engine.
- Pinning the dictionary argument (`'public.unaccent'`) makes the wrapper deterministic enough to mark `IMMUTABLE`.

**Harder / trade-offs**

- The wrapper's `IMMUTABLE` label is a **deliberate over-promise**: if the `unaccent` dictionary is ever swapped, the index would silently go stale and need a `REINDEX`. Acceptable because the dictionary is fixed.
- Queries **must** wrap the search term in `immutable_unaccent(lower(...))` to hit the index; raw `ILIKE` would do a sequential scan. This coupling is documented in `CLAUDE.md` workaround #13 and the stories DTO comment.

## Alternatives considered

- **Postgres `tsvector` full-text search** — rejected; trigram `ILIKE` better fits short titles, partial/typo-tolerant matching, and accent stripping without configuring a Vietnamese text-search dictionary.
- **A dedicated search service (Elasticsearch / Meilisearch)** — rejected; another service to host and back up, unjustified for a single-table title search on a laptop ([ADR 0006](0006-laptop-self-host-cloudflare-tunnel.md)).
- **Indexing raw `unaccent()`** — impossible; it is `STABLE`, hence the wrapper.

## Related

- Data model reference: [`../reference/data-model.md`](../reference/data-model.md)
- Crosscutting concepts (search): [`../architecture/08-crosscutting-concepts.md`](../architecture/08-crosscutting-concepts.md)
