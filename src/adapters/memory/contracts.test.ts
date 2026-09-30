import { describeCacheContract } from "../../tests/contract/cache.contract";
import { describeDatabaseContract } from "../../tests/contract/database.contract";
import { describeObjectsContract } from "../../tests/contract/objects.contract";
import { describePubSubContract } from "../../tests/contract/pubsub.contract";
import { describeQueueContract } from "../../tests/contract/queue.contract";
import { describeRealtimeContract } from "../../tests/contract/realtime.contract";
import { createMemoryCache } from "./memory-cache";
import { createMemoryObjects } from "./memory-objects";
import { createMemoryPubSub } from "./memory-pubsub";
import { createMemoryQueue } from "./memory-queue";
import { createMemoryRealtime } from "./memory-realtime";

describeCacheContract("memory", () => createMemoryCache());
describeObjectsContract("memory", () => createMemoryObjects());
describeQueueContract("memory", () => createMemoryQueue());
describeRealtimeContract("memory", (events) => {
  const realtime = createMemoryRealtime(events);
  return { port: realtime, connect: () => realtime.connectClient() };
});
describePubSubContract("memory", () => createMemoryPubSub());
describeDatabaseContract("memory", () => ({ client: { tag: "memory-test-db" } }));
