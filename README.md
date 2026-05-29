# svelte-pg-live-query

Typed PostgreSQL `LISTEN/NOTIFY` helpers for SvelteKit `query.live(...)` remote functions.

This package gives you a single factory API:

- `createPgLiveQuery<Channels>(options?)`

You define your channel-to-payload types once, then use `pgLiveQuery.fn(...)` inside `query.live(...)`.

## Install

```sh
npm install svelte-pg-live-query pg-listen
```

## What you get

- Strongly-typed payloads per channel
- Shared Postgres listener scaffolding under the hood
- Easy `onInit` + `onNotified` live query model
- Configurable listener connection/options via factory

## Payload shape

Recommended notify payload shape from SQL trigger:

```json
{
  "operation": "INSERT | UPDATE | DELETE",
  "table": "User",
  "row": { "...": "row data" }
}
```

Using a single `row` field is easier to type than `new`/`old` branching.

## SQL trigger example

```sql
CREATE OR REPLACE FUNCTION notify_table_change() RETURNS trigger AS $$
DECLARE
  payload JSON;
BEGIN
  payload := json_build_object(
    'operation', TG_OP,
    'table', TG_TABLE_NAME,
    'row', CASE WHEN TG_OP = 'DELETE' THEN row_to_json(OLD) ELSE row_to_json(NEW) END
  );

  PERFORM pg_notify(TG_ARGV[0], payload::text);

  IF (TG_OP = 'DELETE') THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

## Basic usage

```ts
// src/routes/some.remote.ts
import { query } from '$app/server';
import { createPgLiveQuery } from 'svelte-pg-live-query';

type Channels = {
  user_changes: {
    operation: 'INSERT' | 'UPDATE' | 'DELETE';
    table: string;
    row: { id: number; email: string; name: string | null };
  };
};

const pgLiveQuery = createPgLiveQuery<Channels>();

export const usersLive = query.live(
  pgLiveQuery.fn({
    channel: 'user_changes',
    onInit: async () => {
      return { ok: true };
    },
    onNotified: async ({ payload }) => {
      // payload is fully typed by channel
      console.log(payload.operation, payload.row.id);
      return { ok: true };
    }
  })
);
```

## Factory options

```ts
const pgLiveQuery = createPgLiveQuery<Channels>({
  debug: true,
  debounceMs: 50,
  postgres: {
    connectionString: process.env.DATABASE_URL,
    subscriberConfig: {
      // any pg-listen subscriber options except connectionString
      retryInterval: 200,
      retryTimeout: 5000
    },
    onError: (error) => {
      console.error('listener error', error);
    }
  }
});
```

### Option reference

- `debug?: boolean`
- `debounceMs?: number`
- `postgres?:`
  - `connectionString?: string`
  - `subscriberConfig?: Omit<pg-listen config, 'connectionString'>`
  - `onError?: (error: Error) => void`

## `fn(...)` options

```ts
pgLiveQuery.fn({
  channel: 'user_changes',
  id: 'users-stream',
  debug: true,
  onInit: async ({ input }) => {
    return null;
  },
  onNotified: async ({ input, payload }) => {
    return payload;
  },
  onServer: ({ input, payload }) => {
    // optional side effects/logging
  }
});
```

### Return semantics

- `onInit` return value is first `yield`
- each `onNotified` return value is yielded to clients
- return `SKIP` to ignore a notification and not emit an update

```ts
import { SKIP } from 'svelte-pg-live-query';
```

## Exports

Root exports:

- `createPgLiveQuery`
- `SKIP`
- `createPostgresListener`
- `defaultPostgresListener`
- `PG_LISTEN_CHANNELS`

Subpath exports are also available:

- `svelte-pg-live-query/pg-live-query`
- `svelte-pg-live-query/postgres-listener`
- `svelte-pg-live-query/pg-listen-channels`

## Publish checklist

1. Ensure `src/lib/index.ts` exports your public API
2. Run:

```sh
npm run prepack
```

3. Verify generated `dist/` contains:

- `index.js` / `index.d.ts`
- `pg-live-query.js` / `pg-live-query.d.ts`
- `postgres-listener.js` / `postgres-listener.d.ts`
- `pg-listen-channels.js` / `pg-listen-channels.d.ts`

4. Publish:

```sh
npm publish
```

## Notes

- This package is designed for server-side usage in SvelteKit remote functions.
- `LISTEN/NOTIFY` channel names and payload JSON shape must match your DB triggers.
