# ADR-0004: Abstract all database access through a queries layer

**Status**: Accepted
**Date**: 2026-06-28

## Context

LinkBreeze v1 is single-tenant (one admin, one bio page). The future hosted
version will be multi-tenant (many users, each with their own page). This
requires scoping all database queries by tenant.

If database calls are scattered across components, routes, and server actions,
adding tenant isolation means rewriting the entire application.

## Decision

**All database access goes through `src/server/queries/`.**

No component, API route, or server action may import Drizzle directly or
call the `db` object. They must call functions from the queries layer.

## Rationale

- **Multi-tenant migration becomes additive**: Adding tenant scoping means
  changing the queries layer only — every consumer automatically inherits
  the change.
- **Centralized validation**: Input validation, error handling, and caching
  happen in one place.
- **Testable**: The queries layer can be unit-tested independently of the UI.
- **Swappable database**: Changing from SQLite to PostgreSQL (ADR-0003) only
  affects the queries layer internals.

## Implementation

```typescript
// ✅ Correct — component calls queries layer
import { getActiveLinks } from "@/server/queries";
const links = await getActiveLinks();

// ❌ Wrong — component calls Drizzle directly
import { db } from "@/db";
import { links } from "@/db/schema";
const result = await db.select().from(links);
```

## Enforcement

This is documented in ../../.github/CONTRIBUTING.md and checked in PR reviews. A future
ESLint rule could enforce this automatically.
