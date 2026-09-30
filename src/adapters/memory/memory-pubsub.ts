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
      let closed = false;
      const iterable = (async function* () {
        try {
          let index = 0;
          for (;;) {
            if (closed) {
              break;
            }
            while (index < queue.length) {
              yield queue[index++] as never;
            }
            if (closed) {
              break;
            }
            await new Promise<void>((resolve) => waiters.push(resolve));
          }
        } finally {
          set?.delete(push);
        }
      })();
      return {
        [Symbol.asyncIterator]() {
          return iterable[Symbol.asyncIterator]();
        },
        close() {
          closed = true;
          for (const wake of waiters.splice(0)) {
            wake();
          }
        },
      };
    },
  };
}
