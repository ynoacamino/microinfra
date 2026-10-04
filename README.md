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

Use latest tag for reproducible installs. Package is consumed straight from src through exports map, so there is no build step and no dist in repo.

```sh
bun add github:ynoacamino/microinfra#latest zod
```

Split entry points keep bundles lean. Core plus memory adapters live in microinfra. Node adapters plus node runtime live in microinfra/node. Edge adapters plus edge runtime live in microinfra/edge. Memory adapters only live in microinfra/memory.

Pin same drizzle-orm as microinfra in your app so schema types match built client. Pin same graphql as microinfra in your app so schema execution matches.

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

Use once to survive reload in dev and serverless reuse. Use createAppRuntimeEdge on edge with bindings and same relations.

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

Wire stashDoEnv to your Durable Object init hook. Wire runQueue to your queue hook. Use once per Nitro preset so reload reuses runtime.

## What you achieved

- One runtime reused across all frameworks
- One GraphQL handler driving Bun, ws, Yoga, Pothos, Next and Start
- One Cloudflare wiring for bindings and queues
- Same context logic for HTTP and sockets

## Next steps

- Turn one Pothos field to read from cache then DB
- Add one queue handler and observe ack and retry
- Move WS endpoint to Durable Objects and keep HTTP on workers
