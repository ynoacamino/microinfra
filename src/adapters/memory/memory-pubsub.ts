import type { PubSubPort } from "../../ports/pubsub";

export function createMemoryPubSub(): PubSubPort {
  const channels = new Map<string, Set<(data: unknown) => void>>();
  return {
    publish(channel, data) {
      for (const push of channels.get(channel) ?? []) push(data);
    },
    subscribe(channel) {
      const queue: unknown[] = [];
      const waiters: Array<() => void> = [];
      const push = (data: unknown) => {
        queue.push(data);
        for (const wake of waiters.splice(0)) wake();
      };
      let set = channels.get(channel);
      if (!set) {
        set = new Set();
        channels.set(channel, set);
      }
      set.add(push);
      return (async function* () {
        try {
          let index = 0;
          for (;;) {
            while (index < queue.length) {
              yield queue[index++] as never;
            }
            await new Promise<void>((resolve) => waiters.push(resolve));
          }
        } finally {
          set?.delete(push);
        }
      })();
    },
  };
}
