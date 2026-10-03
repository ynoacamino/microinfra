import type { CachePort } from "../ports/cache";
import type { ClockPort } from "../ports/clock";
import type { EnvConfig } from "../ports/config";
import type { DatabasePort } from "../ports/database";
import type { EnvPort } from "../ports/env";
import type { IdsPort } from "../ports/ids";
import type { LoggerPort } from "../ports/logger";
import type { ObjectPort } from "../ports/object-storage";
import type { PubSubPort } from "../ports/pubsub";
import type { QueuePort } from "../ports/queue";
import type { RealtimePort } from "../ports/realtime";

export type RuntimeMode = "edge" | "node" | "test";

export interface RuntimeEnv<TRaw = unknown, TOrm = unknown> {
  mode: RuntimeMode;
  env: EnvPort;
  config: EnvConfig;
  logger: LoggerPort;
  clock: ClockPort;
  ids: IdsPort;
  db: DatabasePort<TRaw, TOrm>;
  cache: CachePort;
  objects: ObjectPort;
  queue?: QueuePort;
  pubsub: PubSubPort;
  realtime?: RealtimePort;
  close?(): Promise<void>;
}
