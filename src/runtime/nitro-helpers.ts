import { cfEnv } from "../adapters/edge/cf-env";
import { isWebSocketUpgradeRequest } from "../core/realtime-hub";
import type { RuntimeEnv } from "../core/types";
import { ensureWorkerStarted } from "./queue-helpers";
import { once } from "./singleton";
import type { JobHandler } from "./worker";

export type NitroWsRoute = `/${string}`;

export interface NitroMicroinfraConfig {
  preset: "bun" | "cloudflare-module";
  features: { websocket: boolean };
  handlers: Array<{ route: NitroWsRoute; handler: string }>;
  plugins: string[];
  alias?: Record<string, string>;
  isEdge: boolean;
}

function isEdgePreset(): boolean {
  return (typeof process === "undefined" ? undefined : process.env.NITRO_PRESET) === "cloudflare-module";
}

/**
 * Single source of truth for the Nitro switch (bun <-> cloudflare-module).
 * Returns plain data — no nitro import — so the app's vite.config.ts is 3 lines.
 * Encapsulates: websocket:false on CF (else crossws intercepts the DO proxy),
 * ws-handler vs cf-ws-handler, worker vs cf-queue plugin, and the
 * @whatwg-node/fetch esm-ponyfill alias required in workerd.
 */
export function nitroMicroinfraConfig(
  opts: { wsRoute?: NitroWsRoute; esmPonyfillPath?: string } = {},
): NitroMicroinfraConfig {
  const edge = isEdgePreset();
  const route = opts.wsRoute ?? "/_ws";
  if (!edge) {
    return {
      preset: "bun",
      features: { websocket: true },
      handlers: [{ route, handler: "./server/ws-handler.ts" }],
      plugins: ["./server/plugins/worker.ts"],
      isEdge: false,
    };
  }
  return {
    preset: "cloudflare-module",
    features: { websocket: false },
    handlers: [{ route, handler: "./server/cf-ws-handler.ts" }],
    plugins: ["./server/plugins/cf-queue.ts"],
    alias: opts.esmPonyfillPath ? { "@whatwg-node/fetch": opts.esmPonyfillPath } : undefined,
    isEdge: true,
  };
}

export interface NitroWsPeer {
  id: string;
  send(text: string): void;
  context?: unknown;
}

export interface NitroWsEvents {
  open(peer: NitroWsPeer): void;
  message(peer: NitroWsPeer, raw: string | { text(): string }): Promise<void>;
  close(peer: NitroWsPeer): Promise<void>;
}

interface GraphqlWsHandlerLike {
  open(peerId: string): void;
  message(peer: { id: string; send(t: string): void; context?: unknown }, text: string): Promise<void>;
  close(peerId: string): Promise<void>;
}

/**
 * Adapts the transport-agnostic graphql-ws machine to Nitro CrossWS events.
 * The app still calls defineWebSocketHandler (keeps `nitro` out of microinfra
 * deps) but the peer adaptation lives here, HMR-safe via once().
 */
export function createNitroWsEvents(
  getHandler: () => GraphqlWsHandlerLike,
  singletonKey = "graphql-ws-nitro",
): NitroWsEvents {
  const handler = () => once(singletonKey, getHandler);
  return {
    open: (peer) => handler().open(peer.id),
    message: async (peer, raw) => {
      const text = typeof raw === "string" ? raw : raw.text();
      await handler().message({ id: peer.id, send: (t) => peer.send(t), context: peer.context }, text);
    },
    close: async (peer) => {
      await handler().close(peer.id);
    },
  };
}

export interface DurableNamespaceLike {
  idFromName(name: string): unknown;
  get(id: unknown): { fetch(req: Request): Promise<Response> };
}

/**
 * Framework-free CF WS proxy: Worker doesn't terminate the socket, it forwards
 * the upgrade to the RealtimeDO singleton. Usable inside defineEventHandler.
 */
export async function cfWsProxyFetch(
  request: Request,
  opts: { bindingName?: string; key?: string } = {},
): Promise<Response> {
  if (!isWebSocketUpgradeRequest(request)) {
    return new Response("Expected WebSocket Upgrade", { status: 426 });
  }
  const ns = cfEnv()?.[opts.bindingName ?? "REALTIME_DO"] as DurableNamespaceLike | undefined;
  if (!ns) return new Response("Durable Object REALTIME_DO no configurado", { status: 500 });
  const stub = ns.get(ns.idFromName(opts.key ?? "realtime"));
  return stub.fetch(request);
}

export interface NitroAppLike {
  hooks: { hook(name: string, fn: (payload: { batch: unknown }) => Promise<void>): void };
}

/**
 * Node worker plugin with retries (never fails silently when Redis wasn't up
 * before dev). Skips on edge — CF consumes via the queue hook instead.
 */
export function defineWorkerPlugin(
  getRuntime: () => RuntimeEnv,
  start: (rt: RuntimeEnv) => Promise<() => Promise<void>>,
  opts: { retries?: number; retryDelayMs?: number } = {},
) {
  return async function workerPlugin(): Promise<void> {
    if (cfEnv()) return;
    const rt = getRuntime();
    if (!rt.queue) return;
    const stop = await ensureWorkerStarted(rt, start, opts);
    rt.logger.info("queue worker iniciado (node)");
    void stop;
  };
}

/** CF queue consumer plugin (wires the Nitro `cloudflare:queue` hook). */
export function defineCfQueuePlugin(runQueueBatch: (payload: { batch: never }) => Promise<void>) {
  return function cfQueuePlugin(nitroApp: NitroAppLike): void {
    nitroApp.hooks.hook("cloudflare:queue", async ({ batch }) => {
      await runQueueBatch({ batch: batch as never });
    });
  };
}

// Re-export JobHandler type for consumers that only import from nitro entry.
export type { JobHandler };
