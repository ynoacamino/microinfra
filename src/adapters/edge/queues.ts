import type { QueuePort } from "../../ports/queue";

export interface QueueJobMessage {
  jobId: string;
  jobType: string;
}

export interface EdgeQueueBinding {
  send(message: QueueJobMessage): Promise<void>;
}

export interface EdgeQueueMessage<T = unknown> {
  body: T;
  ack(): void;
  retry(): void;
}

export interface EdgeQueueBatch<T = unknown> {
  messages: EdgeQueueMessage<T>[];
  queue: string;
}

export function isQueueBindingConfigured(binding?: { send?: unknown }): boolean {
  return typeof binding?.send === "function";
}

export function createQueuesQueue(binding: EdgeQueueBinding): QueuePort {
  return {
    enqueueJob: async (jobId, jobType) => {
      await binding.send({ jobId, jobType });
      return true;
    },
    processNextJob: async () => null,
    ackJob: async () => {},
    startWorker: async () => {
      throw new Error(
        "[queue] Polling is not supported on edge; handle batches with createQueueConsumer in the worker entry.",
      );
    },
    stopWorker: async () => {},
    isWorkerRunning: () => false,
  };
}

export type EdgeJobHandler = (job: QueueJobMessage) => Promise<void>;

export function createQueueConsumer(handlers: Record<string, EdgeJobHandler>) {
  return async (batch: EdgeQueueBatch<QueueJobMessage>): Promise<void> => {
    for (const message of batch.messages) {
      const handler = handlers[message.body.jobType];
      if (!handler) {
        message.retry();
        continue;
      }
      try {
        await handler(message.body);
        message.ack();
      } catch {
        message.retry();
      }
    }
  };
}
