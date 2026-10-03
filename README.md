# microinfra

[![CI](https://github.com/ynoacamino/microinfra/actions/workflows/ci.yml/badge.svg)](https://github.com/ynoacamino/microinfra/actions/workflows/ci.yml)

Agnostic infrastructure engine with typed ports, pluggable adapters for edge (Cloudflare) and on-premise (Docker Compose), and composable runtime.

No vendor lock-in, no hardcoded SDKs. `microinfra` owns the contracts — typed ports, registry, env schema, composable runtime — and the app owns the wiring through adapters.

## Features

- **Typed ports** — cache, database, object storage, queue, pubsub, and realtime are interfaces. Memory adapters ship in the box, real ones are one import away.
- **Composable runtime** — `createTestInfra`, `createNodeInfra`, `createEdgeInfra` assemble the same `RuntimeEnv` shape for tests, containers, and Workers.
- **Node adapters** — libSQL, HTTP Redis cache (Upstash or self-hosted), Redis Streams queue with worker, S3-compatible objects, `ws`/`Bun.serve` realtime.
- **Edge adapters** — KV cache, R2 objects, D1 database, Queues producer/consumer, Durable Objects realtime with hibernation.
- **Workers** — `runWorker` routes jobs by type over any `QueuePort`; edge batches route through `createQueueConsumer`.
- **Zod env schema** — one `EnvConfig` validated from any `EnvPort`, zero hardcoded domains.
- **Test contracts** — every port has a contract suite, so custom adapters prove compatibility by running it.

## Installation

Distributed through GitHub releases. No npm publish.

```bash
# bun
bun add github:ynoacamino/microinfra#v0.1.0 zod

# npm
npm install github:ynoacamino/microinfra#v0.1.0

# pnpm
pnpm add github:ynoacamino/microinfra#v0.1.0
```

Pin a tag for reproducible installs. The package is consumed straight from `src/` through the `exports` map, so there is no build step and no `dist/` in the repo. Peer dependencies resolve from npm as usual:

| Peer  | Version | Needed for |
| ----- | ------- | ---------- |
| `zod` | `^4`    | `microinfra` |

Split entry points keep bundles lean:

| Import              | Contents                                  |
| ------------------- | ----------------------------------------- |
| `microinfra`        | Core, memory adapters, test runtime       |
| `microinfra/node`   | Node adapters + node runtime (`libsql`, `ws`, S3, Redis) |
| `microinfra/edge`   | Edge adapters + edge runtime (KV, R2, D1, Queues, Durable Objects) |
| `microinfra/memory` | Memory adapters only                      |

## Usage

### Test runtime: everything in memory

```ts
import { createTestInfra } from "microinfra";

const rt = createTestInfra({ env: { PORT: "7001" } });

await rt.cache.put("k", "v");
await rt.queue?.enqueueJob("job-1", "export");
rt.pubsub.publish("events", { hello: "world" });
```

### Node runtime: containers with memory fallbacks

```ts
import { createNodeInfra } from "microinfra/node";

const rt = createNodeInfra({ vars: process.env as Record<string, string>, dbClient: libsql });
// redis configured -> HTTP Redis cache + Redis Streams queue, else memory
// S3 configured -> S3 objects, else inject objectPort or memory
```

### App runtime: database without drizzle constructors

```ts
import { createAppRuntime } from "microinfra/node";
import { relations } from "./db/schema"; // tables + defineRelations

const rt = createAppRuntime(process.env, { relations });
const db = rt.db.orm; // LibSQLDatabase<typeof relations>, driver picked by URL scheme
// DATABASE_URL http(s): -> libsql-server/Turso, file: -> embedded (forbidFileDb by default)
```

The app only declares tables + `defineRelations`; microinfra picks the driver (embedded vs http vs D1 on edge via `createAppRuntimeEdge`). Pin the same `drizzle-orm` version as microinfra (`1.0.0-rc.4`) so schema types match the built client.

### Background jobs

```ts
import { runWorker } from "microinfra";

const stop = await runWorker(rt, {
  export: async (jobId) => service.processJob(jobId),
});
// ...
await stop();
```

### Realtime: one event object, every transport

```ts
import { createMemoryRealtime } from "microinfra";
import { attachWsRealtime } from "microinfra/node";
import { createDurableRealtime } from "microinfra/edge";

const events = {
  onConnect: (c) => c.send(JSON.stringify({ type: "welcome", id: c.id })),
  onMessage: (c, message) => realtime.broadcast(`[${c.id}] ${message}`),
  onDisconnect: (c) => console.log("bye", c.id),
};

const realtime = createMemoryRealtime(events);
const client = await realtime.connectClient();
await client.sendToServer("hello");

attachWsRealtime(wss, events); // node (ws)
// Bun.serve({ fetch, websocket: createBunRealtimeHandler(events).handler })
createDurableRealtime(ctx, events); // inside your Durable Object
```

## Patterns

### Ports and adapters

Every side effect is a port. Implement the interface with your stack and inject it:

```ts
import { createMemoryCache } from "microinfra";
import type { CachePort, QueuePort } from "microinfra";

const cache: CachePort = createMemoryCache();
await cache.put("session:1", "…", { ttlMs: 60_000 });
```

### Runtime per target

`createTestInfra` for unit tests, `createNodeInfra` for Docker Compose, `createEdgeInfra` for Cloudflare Workers. All three return the same `RuntimeEnv`, so application code never branches on the target.

### Contracts

Custom adapters prove compatibility by running the contract suite. Copy the suites from `src/tests/contract/` (`cache`, `objects`, `queue`, `pubsub`, `realtime`, `database`) into your test setup and run them against your adapter:

```ts
import { describeRealtimeContract } from "./contracts/realtime.contract";

describeRealtimeContract("my-adapter", (events) => myHarness(events));
```

### Realtime chat relay

`src/examples/realtime-chat.ts` shows the standard wiring: one `RealtimeEvents` object driving memory, `ws`, `Bun.serve`, and Durable Objects.

## Versioning

Releases are semver tags published to GitHub Releases. Pin the tag in your install string:

```bash
bun add github:ynoacamino/microinfra#v0.1.0
```
