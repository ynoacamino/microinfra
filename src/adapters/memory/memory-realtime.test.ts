import { describe, expect, it } from "vitest";
import type { RealtimeEvents } from "../../ports/realtime";
import { describeRealtimeContract, type RealtimeHarness } from "../../tests/contract/realtime.contract";
import { createMemoryRealtime } from "./memory-realtime";

describeRealtimeContract("memory", (events: RealtimeEvents): RealtimeHarness => {
  const realtime = createMemoryRealtime(events);
  return {
    port: realtime,
    connect: () => realtime.connectClient(),
  };
});

describe("memory realtime client", () => {
  it("marks clients closed by closeAll", async () => {
    const realtime = createMemoryRealtime();
    const client = await realtime.connectClient("a");
    expect(client.closed).toBe(false);
    await realtime.closeAll(1000, "bye");
    expect(client.closed).toBe(true);
  });
});
