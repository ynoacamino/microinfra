import { describe, expect, it } from "vitest";
import type { PubSubPort } from "../../ports/pubsub";

export function describePubSubContract(name: string, makePubSub: () => PubSubPort | Promise<PubSubPort>): void {
  describe(`PubSubPort contract [${name}]`, () => {
    it("delivers published messages to subscribers", async () => {
      const pubsub = await makePubSub();
      const channel = `contract-${crypto.randomUUID()}`;
      const iterator = pubsub.subscribe<string>(channel)[Symbol.asyncIterator]();
      pubsub.publish(channel, "ping");
      expect((await iterator.next()).value).toBe("ping");
      await iterator.return?.(undefined);
    });
  });
}
