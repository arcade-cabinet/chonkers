---
title: src/persistence
updated: 2026-04-29
status: current
domain: technical
---

# src/persistence

Generic Capacitor-backed transport. Exposes two surfaces:

- **`kv`** — typed JSON key-value store over `@capacitor/preferences`.
- **`db`** — raw SQL transport over `@capacitor-community/sqlite` (with `jeep-sqlite` web fallback).

Zero knowledge of chonkers-specific concepts. Schema and typed data access live elsewhere (`src/schema/`, `src/store/`).

## Quick start

### `kv` — typed settings round-trip

```ts
import { kv } from '@/persistence';

interface Settings {
  volume: number;
  muted: boolean;
}

await kv.put<Settings>('settings', 'current', { volume: 0.7, muted: false });
const settings = await kv.get<Settings>('settings', 'current');
```

### `db` — table + JSON column + json_extract query

```ts
import { db } from '@/persistence';

const conn = await db.connect('my-db', 1);

await conn.exec(`
  CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    payload TEXT NOT NULL
  )
`);

await conn.exec(
  'INSERT INTO notes (id, payload) VALUES (?, ?)',
  ['n-1', JSON.stringify({ title: 'hello', tags: ['a', 'b'] })],
);

const rows = await conn.query<{ title: string }>(
  `SELECT json_extract(payload, '$.title') AS title FROM notes WHERE id = ?`,
  ['n-1'],
);
console.log(rows[0]?.title); // 'hello'

await db.close('my-db');
```

## Full contract

See [`docs/PERSISTENCE.md`](../../docs/PERSISTENCE.md) for the complete API reference, JSON-column workflow, test environment, environment variables, portability instructions, and rationale.

## Cross-package boundaries

Implementation files MUST NOT import from `@/engine`, `@/ai`, `@/sim`, `@/store`, `@/schema`, or any other chonkers-specific package. Test files in `__tests__/` MAY import from `@/persistence` (testing the public surface) but not from chonkers-specific packages.

Verify portability:

```bash
grep -r "from '@/" src/persistence --exclude-dir=__tests__   # zero hits
grep -r "from '\\.\\./\\.\\./" src/persistence                # zero hits
```
