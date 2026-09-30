export interface DatabasePort<TClient = unknown> {
  readonly client: TClient;
  close?(): Promise<void>;
}
