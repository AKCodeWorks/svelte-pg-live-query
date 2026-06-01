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
- Built-in heartbeat events to keep idle streams alive

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

## Stream event envelope

Every emitted item is wrapped in a typed envelope:

```ts
type PgLiveQueryValue<T> =
  | { type: 'init'; data: T }
  | { type: 'update'; data: T }
  | { type: 'heartbeat'; data: null }
  | { type: 'error'; data: { message: string } };
```

- `init`: first successful value from `onInit`
- `update`: successful value from `onNotified`
- `heartbeat`: emitted when stream is idle
- `error`: emitted when `onInit` or `onNotified` throws

## Factory options

```ts
const pgLiveQuery = createPgLiveQuery<Channels>({
  debug: true,
  debounceMs: 50,
  heartbeatMs: 5000,
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
- `heartbeatMs?: number` (default: `5000`, set `0` to disable)
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
  heartbeatMs: 5000,
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
- thrown errors from `onInit`/`onNotified` are emitted as `{ type: 'error', data: { message } }`

```ts
import { SKIP } from 'svelte-pg-live-query';
```

## Client consumption pattern (`await query`)

If reading `query.current` causes hydration issues in your app, consume via `await query` and cache the last reliable `init`/`update` value:

```ts
import type { RemoteLiveQuery } from '@sveltejs/kit';
import type { PgLiveQueryValue } from 'svelte-pg-live-query/pg-live-query';

type LiveData<TLiveQuery> =
  TLiveQuery extends RemoteLiveQuery<PgLiveQueryValue<infer TData>> ? TData : never;

type ConsumeWithCache = typeof consumePgLive & {
  __cache?: WeakMap<object, unknown>;
};

async function consumePgLive<TLiveQuery extends RemoteLiveQuery<PgLiveQueryValue<unknown>>>(
  query: TLiveQuery
) {
  type TData = LiveData<TLiveQuery>;
  const fn = consumePgLive as ConsumeWithCache;
  const cache = (fn.__cache ??= new WeakMap<object, unknown>());
  const key = query as unknown as object;
  const event = await query;

  let value = cache.get(key) as TData | undefined;
  if (
    event &&
    (event.type === 'init' || event.type === 'update') &&
    event.data !== null &&
    event.data !== undefined
  ) {
    value = event.data as TData;
    cache.set(key, value);
  }

  const error =
    event?.type === 'error'
      ? event.data.message
      : query.error instanceof Error
        ? query.error.message
        : undefined;

  return {
    value,
    connected: query.connected,
    error
  };
}
```

## SKIP example (ignore unrelated updates)

Use `SKIP` when a notification is valid but not relevant to the current live-query input.

```ts
import { query } from '$app/server';
import { createPgLiveQuery, SKIP } from 'svelte-pg-live-query';

type Channels = {
  user_changes: {
    operation: 'INSERT' | 'UPDATE' | 'DELETE';
    table: string;
    row: { id: number; email: string };
  };
};

const pgLiveQuery = createPgLiveQuery<Channels>();

export const userByIdLive = query.live(
  pgLiveQuery.fn({
    channel: 'user_changes',
    onInit: async ({ input }: { input: { id: number } }) => {
      return { id: input.id };
    },
    onNotified: async ({ input, payload }) => {
      // Ignore notifications for other users
      if (payload.row.id !== input.id) return SKIP;

      return payload.row;
    }
  })
);
```

## Database setup requirement

This library does not create database triggers for you. You must create your own Postgres `NOTIFY` triggers/channels that match the channel names and payload shape used in your `createPgLiveQuery` config.

PostgreSQL trigger docs:
- [CREATE TRIGGER](https://www.postgresql.org/docs/current/sql-createtrigger.html)

## Prisma migration example (create + apply trigger)

Below is a minimal example using Prisma migrations to create `NOTIFY` triggers.

### 1) Create an empty migration

```sh
npx prisma migrate dev --name add_user_changes_listener --create-only
```

This creates a new migration folder with `migration.sql` that you can edit before applying.

### 2) Edit `migration.sql`

```sql
-- Function that sends one consistent payload shape
CREATE OR REPLACE FUNCTION notify_table_change() RETURNS trigger AS $$
DECLARE
  payload JSON;
BEGIN
  payload := json_build_object(
    'operation', TG_OP,          -- operation type: INSERT | UPDATE | DELETE
    'table', TG_TABLE_NAME,      -- table name that fired the trigger
    'row', CASE                  -- row shape returned to your live query payload
      WHEN TG_OP = 'DELETE' THEN row_to_json(OLD)
      ELSE row_to_json(NEW)
    END
  );

  -- Channel name your app listens to (must match `pgLiveQuery.fn({ channel: ... })`)
  PERFORM pg_notify('user_changes', payload::text);

  IF (TG_OP = 'DELETE') THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger name (you choose this; useful for identifying/dropping later)
CREATE TRIGGER user_notify_changes
AFTER INSERT OR UPDATE OR DELETE ON "User"
FOR EACH ROW
EXECUTE FUNCTION notify_table_change();
```

### 3) Apply migration to database

```sh
npx prisma migrate dev
```

### 4) Match channel + payload type in your live query

```ts
type Channels = {
  user_changes: {
    operation: 'INSERT' | 'UPDATE' | 'DELETE'; // from payload.operation
    table: string;                              // from payload.table
    row: { id: number; email: string };         // from payload.row
  };
};
```

```ts
import { query } from '$app/server';
import { createPgLiveQuery, SKIP } from 'svelte-pg-live-query';
import { prisma } from '$lib/server/db'; // your Prisma client path

type Channels = {
  user_changes: {
    operation: 'INSERT' | 'UPDATE' | 'DELETE';
    table: string;
    row: { id: number; email: string; name: string | null };
  };
};

const pgLiveQuery = createPgLiveQuery<Channels>();

export const userByIdLive = query.live(
  pgLiveQuery.fn({
    channel: 'user_changes', // must match pg_notify('user_changes', ...)
    onInit: async ({ input }: { input: { id: number } }) => {
      return prisma.user.findUnique({ where: { id: input.id } });
    },
    onNotified: async ({ input, payload }) => {
      if (payload.row.id !== input.id) return SKIP; // ignore unrelated updates
      return prisma.user.findUnique({ where: { id: input.id } });
    }
  })
);
```
