export interface QueueJob {
  jobId: string;
  jobType: string;
  streamId: string;
  /** Optional opaque payload (JSON recommended). Transport limits may apply. */
  data?: string;
}

export interface QueuePort {
  enqueueJob(jobId: string, jobType: string, data?: string): Promise<boolean>;
  processNextJob(): Promise<QueueJob | null>;
  ackJob(streamId: string): Promise<void>;
  startWorker(onJob: (job: QueueJob) => Promise<void>): Promise<void>;
  stopWorker(): Promise<void>;
  isWorkerRunning(): boolean;
}
