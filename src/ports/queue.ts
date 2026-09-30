export interface QueueJob {
  jobId: string;
  jobType: string;
  streamId: string;
}

export interface QueuePort {
  enqueueJob(jobId: string, jobType: string): Promise<boolean>;
  processNextJob(): Promise<QueueJob | null>;
  ackJob(streamId: string): Promise<void>;
  startWorker(onJob: (job: QueueJob) => Promise<void>): Promise<void>;
  stopWorker(): Promise<void>;
  isWorkerRunning(): boolean;
}
