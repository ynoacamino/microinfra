import { a as ClockPort, i as IdsPort, l as QueuePort, m as EnvPort, o as ObjectPort, p as RealtimePort, r as LoggerPort, t as PubSubPort, u as CachePort } from "./pubsub-6-hdisbt.js";
//#region src/ports/database.d.ts
interface DatabasePort<TRaw = unknown, TOrm = unknown> {
  readonly client: TRaw;
  /** Framework ORM instance built over the raw client (e.g. Drizzle). Set by createAppRuntime. */
  readonly orm?: TOrm;
  close?(): Promise<void>;
}
//#endregion
//#region src/ports/config.d.ts
interface EnvConfig {
  nodeEnv: "development" | "production" | "test";
  backendUrl: string;
  port: number;
  corsOrigins: string[];
  trustedOrigins: string[];
  database: {
    url: string | undefined;
    authToken: string | undefined;
  };
  s3: {
    accessKeyId: string;
    secretAccessKey: string;
    region: string;
    bucket: string;
    endpoint: string;
    publicUrl: string;
    forcePathStyle: boolean;
  };
  redis: {
    url: string | undefined;
    token: string | undefined;
  };
  export: {
    maxRows: number;
  };
  import: {
    maxFileMb: number;
  };
  dev: {
    seedToken: string | undefined;
  };
}
//#endregion
//#region src/core/types.d.ts
type RuntimeMode = "edge" | "node" | "test";
interface RuntimeEnv<TRaw = unknown, TOrm = unknown> {
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
//#endregion
export { DatabasePort as i, RuntimeMode as n, EnvConfig as r, RuntimeEnv as t };
//# sourceMappingURL=types-CD7cOcEI.d.ts.map