import { GenericContainer, Network, Wait } from "testcontainers";

export interface RedisStack {
  url: string;
  token: string;
  stop: () => Promise<void>;
}

export async function startRedisStack(): Promise<RedisStack> {
  const network = await new Network().start();
  try {
    const redis = await new GenericContainer("redis:7-alpine")
      .withNetwork(network)
      .withNetworkAliases("redis")
      .withWaitStrategy(Wait.forLogMessage(/Ready to accept connections/))
      .start();
    try {
      const token = "integration-token";
      const http = await new GenericContainer("hiett/serverless-redis-http:latest")
        .withNetwork(network)
        .withExposedPorts(80)
        .withEnvironment({
          SRH_MODE: "env",
          SRH_TOKEN: token,
          SRH_CONNECTION_STRING: "redis://redis:6379",
          SRH_MAX_CONNECTIONS: "3",
        })
        .start();
      await waitForHttp(`http://${http.getHost()}:${http.getMappedPort(80)}/`, 90_000);
      const url = `http://${http.getHost()}:${http.getMappedPort(80)}`;
      return {
        url,
        token,
        stop: async () => {
          await http.stop();
          await redis.stop();
          await network.stop();
        },
      };
    } catch (error) {
      await redis.stop();
      throw error;
    }
  } catch (error) {
    await network.stop();
    throw error;
  }
}

export interface GarageStack {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  stop: () => Promise<void>;
}

const GARAGE_TOML = `metadata_dir = "/data/meta"
data_dir = "/data/data"

replication_factor = 1
consistency_mode = "consistent"

rpc_bind_addr = "0.0.0.0:3901"
rpc_public_addr = "127.0.0.1:3901"

bootstrap_peers = []

[s3_api]
enabled = true
s3_region = "garage"
api_bind_addr = "[::]:3900"
`;

export async function startGarage(): Promise<GarageStack> {
  const accessKeyId = "GKintegrationtest00000";
  const secretAccessKey = "integrationtestsecret0123456789abcdef0123456789abcdef0123456789ab";
  const bucket = "integration-tests";
  const rpcSecret = `${crypto.randomUUID().replaceAll("-", "")}${crypto.randomUUID().replaceAll("-", "")}`;
  const container = await new GenericContainer("dxflrs/garage:v2.3.0")
    .withCopyContentToContainer([{ content: GARAGE_TOML, target: "/etc/garage.toml" }])
    .withEnvironment({
      GARAGE_RPC_SECRET: rpcSecret,
      GARAGE_DEFAULT_ACCESS_KEY: accessKeyId,
      GARAGE_DEFAULT_SECRET_KEY: secretAccessKey,
      GARAGE_DEFAULT_BUCKET: bucket,
    })
    .withCommand(["/garage", "server", "--single-node", "--default-bucket"])
    .withExposedPorts(3900)
    .withWaitStrategy(Wait.forHttp("/", 3900).forStatusCode(403))
    .start();
  const endpoint = `http://${container.getHost()}:${container.getMappedPort(3900)}`;
  try {
    await waitForHttp(`${endpoint}/`, 120_000);
  } catch (error) {
    await container.stop();
    throw error;
  }
  return {
    endpoint,
    accessKeyId,
    secretAccessKey,
    bucket,
    stop: async () => {
      await container.stop();
    },
  };
}

export interface LibsqlStack {
  url: string;
  stop: () => Promise<void>;
}

export async function startLibsql(): Promise<LibsqlStack> {
  const container = await new GenericContainer("ghcr.io/tursodatabase/libsql-server:latest")
    .withEnvironment({ SQLD_NODE_PRIMARY_URL: "file:primary.db" })
    .withExposedPorts(8080)
    .withWaitStrategy(Wait.forHttp("/health", 8080))
    .start();
  return {
    url: `http://${container.getHost()}:${container.getMappedPort(8080)}`,
    stop: async () => {
      await container.stop();
    },
  };
}

async function waitForHttp(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      await fetch(url);
      return;
    } catch {
      if (Date.now() > deadline) {
        throw new Error(`Timed out waiting for ${url}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
}
