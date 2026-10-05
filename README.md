# microinfra

Agnostic infrastructure engine with typed ports and composable runtime for memory, Node and edge.

No vendor lock-in. No hardcoded SDKs. microinfra owns contracts and wiring helpers. Your app owns schema and business logic.

## What you will build

By the end of this tutorial you will run one runtime across Bun, Yoga, Pothos, Next, TanStack Start and Cloudflare, with GraphQL over WebSocket and queue workers sharing the same context logic.

Audience: developers integrating microinfra for the first time.
Goal: integrate and use latest transport and Cloudflare helpers in your stack.
Scope: latest GraphQL WS flow and Cloudflare entry helpers only. No deep dive into cache, objects, queue internals or contracts.

## Requirements

- Bun installed and working
- A GraphQL schema built with Yoga or Pothos
- A relations object defined with defineRelations
- Access to Cloudflare bindings only if you deploy to edge

## Install

Pin a tag for reproducible installs. Package is consumed straight from src through exports map, so there is no build step and no dist in repo.

```sh
# bun
bun add github:ynoacamino/microinfra#v0.8.0 zod

# npm
npm install github:ynoacamino/microinfra#v0.8.0

# pnpm
pnpm add github:ynoacamino/microinfra#v0.8.0
```

Split entry points keep bundles lean:

| Import            | Contents                                                                                                          |
| ----------------- | ----------------------------------------------------------------------------------------------------------------- |
| `microinfra`      | Core, memory adapters, test runtime, unified DB types (`AppDrizzleDb`, `requireOrm`), queue helpers              |
| `microinfra/node` | Node adapters + node runtime (`libsql`, `ws`, S3, Redis)                                                          |
| `microinfra/edge` | Edge adapters + edge runtime (KV, R2, D1, Queues, Durable Objects, `defineRealtimeDO`)                            |
| `microinfra/hybrid` | One-line switchable runtime (`createHybridRuntime`, `resolveTarget`) — node/libsql or edge/D1 from the same call |
| `microinfra/nitro`  | Framework wiring without framework deps (Nitro config, WS events, CF proxy, worker plugins, realtime DO)          |
| `microinfra/memory` | Memory adapters only                                                                                              |

Pin same drizzle-orm as microinfra in your app so schema types match built client. Pin same graphql as microinfra in your app so schema execution matches.

Rule of thumb: app code imports from `microinfra` only. Only one wiring file imports from `microinfra/node`, `microinfra/edge`, `microinfra/hybrid` or `microinfra/nitro` (see section 8).

## 1 Quick start with memory

Goal: see runtime shape with zero external services.

```ts
import { createTestInfra } from "microinfra";

const rt = createTestInfra({
  env: {
    PORT: "7001"
  }
});

await rt.cache.put("k", "v");
rt.pubsub.publish("events", { hello: "world" });
```

Expected: cache write succeeds and pubsub publish returns without error. You now know RuntimeEnv shape used everywhere else.

## 2 Prepare your runtime once

Goal: create one shared runtime for your app process.

```ts
import { once } from "microinfra";
import { createAppRuntime } from "microinfra/node";
import { relations } from "./db/schema";

export const rt = once("infra", () =>
  createAppRuntime(process.env, { relations })
);
```

Expected: rt.db.orm ready, driver picked by DATABASE_URL scheme, file scheme for embedded and http scheme for remote. Reuse rt in every handler. Do not create a new runtime per request.

Use once to survive reload in dev and serverless reuse. Use createAppRuntimeEdge on edge with bindings and same relations. If you deploy to both Docker and Cloudflare from one codebase, skip this manual branching and use createHybridRuntime from section 8.

## 3 Enable GraphQL over WebSocket

Goal: run graphql-ws protocol without importing any transport library.

Handler owns all state per peer and operation. Each transport adapts to same peer shape with id, send and context.

```ts
import { contextFromRuntime, syntheticRequest } from "microinfra";
import { createGraphqlWs } from "microinfra";

const graphqlWs = createGraphqlWs({
  schema,
  getContext: (peer) =>
    contextFromRuntime(rt, {
      db: rt.db.orm,
      user: peer.context,
      request: syntheticRequest("ws://internal/graphql")
    })
});
```

Expected: graphqlWs exposes open, message and close. Protocol handled as connection init answers ack, ping answers pong, subscribe streams next then complete or error, complete cancels one operation, close cancels all for that peer. Invalid payloads ignored silently. Parse and validation failures send error without complete. Resolver failures send next with errors then complete. Stream directives send error.

State lives on handler instance, so each handler owns peer registry and is testable with fake peers and no socket.

## 4 Connect Bun and ws

Goal: expose same handler on Bun serve and node ws.

```ts
Bun.serve({
  port: 4000,
  fetch(req, server) {
    const peerId = crypto.randomUUID();
    if (server.upgrade(req, { data: { peerId } })) {
      return undefined;
    }
    return new Response("ws only", { status: 426 });
  },
  websocket: {
    open(ws) {
      graphqlWs.open(ws.data.peerId);
    },
    async message(ws, msg) {
      await graphqlWs.message(
        {
          id: ws.data.peerId,
          send: (t) => ws.send(t),
          context: ws.data
        },
        String(msg)
      );
    },
    async close(ws) {
      await graphqlWs.close(ws.data.peerId);
    }
  }
});
```

Expected: Bun upgrades HTTP to socket, open registers peer, message routes GraphQL frames, close releases all operations. Use same three calls for node ws and CrossWS and Durable Objects. Populate context at upgrade with user data, then read it in getContext for auth.

## 5 Connect Yoga and Pothos

Goal: use one context for HTTP and sockets.

```ts
import { createYoga } from "graphql-yoga";
import SchemaBuilder from "@pothos/core";
import { sessionUser } from "microinfra";

const builder = new SchemaBuilder({ Context: {} });
const schema = builder.toSchema();

const yoga = createYoga({
  schema,
  context: async ({ request }) => {
    const session = await auth.api.getSession({ headers: request.headers });
    return contextFromRuntime(rt, {
      db: rt.db.orm,
      user: sessionUser(session),
      request
    });
  }
});
```

Expected: Yoga serves HTTP with full user context. Sockets reuse same schema via getContext. Pothos fields resolve with db, runtime, user and request. Pothos subscriptions can consume pubsub as async source.

Keep Yoga for HTTP only. Keep WS logic in graphqlWs handler. Share ServiceContext type between both paths.

## 6 Connect Next and TanStack Start

Goal: serve GraphQL HTTP from server routes and keep sockets outside serverless handlers.

```ts
export async function POST(req) {
  const ctx = contextFromRuntime(rt, {
    db: rt.db.orm,
    user: sessionUser(await getSession()),
    request: req
  });
  return toNativeResponse(await yoga.handleRequest(req, ctx));
}
```

```ts
export async function createPost(fd) {
  const ctx = contextFromRuntime(rt, {
    db: rt.db.orm,
    user: sessionUser(await getSession()),
    request: syntheticRequest("next://server-action")
  });
  return service.create(ctx, fd);
}
```

Expected: route handler returns native response. Server action builds context with synthetic request. TanStack Start uses same pattern with serverFn and api route. Always convert Yoga response with toNativeResponse. That helper buffers body and does not support streaming.

Do not run long polling workers inside route handlers. Run workers in separate process with runWorker or edge batch runner.

## 7 Deploy to Cloudflare

Goal: read bindings inside workers and Durable Objects and run queue batches with one helper.

Worker entrypoints populate global env, but code inside Durable Objects never runs those entrypoints, so bindings are invisible there unless stashed.

```ts
import { cfEnv, stashDoEnv } from "microinfra/edge";
import { createAppRuntimeEdge } from "microinfra/edge";

class ChatRoom {
  constructor(state, env) {
    stashDoEnv({ env });
  }
  async fetch(req) {
    const bindings = cfEnv();
    const runtime = createAppRuntimeEdge(bindings, { relations });
    return new Response("ok");
  }
}
```

```ts
import { createBatchRunner } from "microinfra/edge";

const runQueue = createBatchRunner({
  createRuntime: (bindings) => createAppRuntimeEdge(bindings, { relations }),
  createHandlers: (runtime) => ({
    "notify.attendance": async (job) => service.notify(job.data)
  })
});
```

Expected: cfEnv returns Durable Object env when stashed, else worker env, else undefined on local. cfVars filters strings for env parsing. runQueue builds edge runtime and routes each message by type, ack on success and retry on unknown type or throw. Missing bindings throws with clear error.

Wire stashDoEnv to your Durable Object init hook. Wire runQueue to your queue hook. Use once per Nitro preset so reload reuses runtime. If you write the Durable Object by hand, prefer defineRealtimeDO from section 10 so hibernation, subprotocol negotiation and attachment ordering come for free.

## 8 Switchable runtime for Docker and Cloudflare

Goal: one wiring file decides node/libsql or edge/D1, everything else stays target-agnostic.

```ts
import { createHybridRuntime } from "microinfra/hybrid";
import { relations } from "./db/schema";

export const getRuntime = (bindings?: Record<string, unknown>) =>
  createHybridRuntime(bindings, { relations });
```

Expected: no bindings means node/libsql. Bindings with DB, KV, MY_BUCKET, QUEUE or REALTIME_DO mean edge/D1. Explicit empty bindings fail loudly asking for the D1 binding instead of silently falling back to node. The singleton survives dev reload and serverless reuse.

On edge with UPSTASH_* configured, pubsub upgrades to shared redis-streams so Worker mutations reach Durable Object subscriptions. Both sides use the same fetch-only adapter, safe in workerd. Without redis config, edge keeps memory pubsub, same isolate only. Pass disableSharedPubsub to opt out.

Type the database once, never import driver types per target:

```ts
import { requireOrm, type AppDrizzleDb } from "microinfra";
import type { relations } from "./db/schema";

export type ServerDb = AppDrizzleDb<typeof relations>;
const db = requireOrm<typeof relations>(rt);
```

Expected: ServerDb is the LibSQL-or-D1 union, same SQLite dialect and relations on both. requireOrm throws an actionable message when DATABASE_URL or the D1 binding is missing. No more `import type { LibSQLDatabase } from "microinfra/node"` in app code.

## 9 Background jobs without silent failures

Goal: enqueue with await semantics that survive Workers, and start node workers with retries.

```ts
import { enqueueJobAndWait, ensureWorkerStarted } from "microinfra";

// Await is required: floating work freezes on Workers after responding.
await enqueueJobAndWait(rt, jobId, "post.index", JSON.stringify({ id }));

// Retries instead of dying silently when Redis was not up before dev.
await ensureWorkerStarted(rt, startNodeWorker, { retries: 5, retryDelayMs: 1000 });
```

Expected: enqueueJobAndWait awaits the queue write and registers waitUntil when the runtime exposes it. ensureWorkerStarted returns the stop function, logs each retry, and throws only after exhausting retries.

## 10 Nitro wiring without framework deps

Goal: switch bun preset and cloudflare-module preset from one helper, with no nitro import inside microinfra.

```ts
import { nitro } from "nitro/vite";
import { nitroMicroinfraConfig } from "microinfra/nitro";
import { fileURLToPath } from "node:url";

nitro({
  ...nitroMicroinfraConfig({
    esmPonyfillPath: fileURLToPath(new URL("./node_modules/@whatwg-node/fetch/dist/esm-ponyfill.js", import.meta.url)),
  }),
});
```

Expected: bun preset keeps websocket enabled with the node WS handler and the node worker plugin. cloudflare-module preset disables websocket so crossws never intercepts the Durable Object proxy, swaps in the CF WS handler and the CF queue plugin, and aliases @whatwg-node/fetch to the ESM ponyfill so workerd never evaluates require("node:fs").

Adapt the protocol machine to Nitro CrossWS events with no per-app peer plumbing:

```ts
import { createNitroWsEvents } from "microinfra/nitro";

export default defineWebSocketHandler(createNitroWsEvents(() => createWsHandler(getRuntime())));
```

Proxy the CF upgrade to the Durable Object singleton:

```ts
import { cfWsProxyFetch } from "microinfra/nitro";

export default defineEventHandler((event) => cfWsProxyFetch(event.req));
```

Start workers through plugins that never fail silently:

```ts
import { defineCfQueuePlugin, defineWorkerPlugin } from "microinfra/nitro";

export default defineWorkerPlugin(() => getRuntime(), (rt) => startNodeWorker(rt));
export default defineCfQueuePlugin((payload) => runQueueBatch(payload));
```

Write the Durable Object from the factory so hibernation details stay in one place:

```ts
import { defineRealtimeDO } from "microinfra/nitro";

export const RealtimeDO = defineRealtimeDO({ createHandler: () => createWsHandler(getRuntime()) });
export const { RealtimeDO: _ } = defineDoExports({ RealtimeDO });
```

Expected: attachment ordering, graphql-transport-ws negotiation in the 101, and peerId routing behave identically for every app. Subscriptions still do not survive DO eviction, re-subscribe from the client. Attachment carries peerId only, do auth at upgrade time.

## Contracts

Goal: prove custom adapters behave like built-in ones.

Custom adapters prove compatibility by running the contract suite. Copy the suites from `src/tests/contract/` (`cache`, `objects`, `queue`, `pubsub`, `realtime`, `database`) into your test setup and run them against your adapter:

```ts
import { describeRealtimeContract } from "./contracts/realtime.contract";

describeRealtimeContract("my-adapter", (events) => myHarness(events));
```

Expected: a passing suite means drop-in compatibility with every runtime that consumes the port.

## What you achieved

- One runtime reused across all frameworks
- One GraphQL handler driving Bun, ws, Yoga, Pothos, Next and Start
- One Cloudflare wiring for bindings and queues
- Same context logic for HTTP and sockets
- One switchable runtime for Docker and Cloudflare with unified DB types
- One Nitro wiring with no silent worker failures

## Next steps

- Turn one Pothos field to read from cache then DB
- Add one queue handler and observe ack and retry
- Move WS endpoint to Durable Objects and keep HTTP on workers
- Replace getRuntime branching with createHybridRuntime and delete per-target type imports
- Replace vite Nitro switch with nitroMicroinfraConfig and delete the manual alias

## Versioning

Releases are semver tags published to GitHub Releases. Pin the tag in your install string:

```bash
bun add github:ynoacamino/microinfra#v0.8.0
```
