export interface DatabasePort<TRaw = unknown, TOrm = unknown> {
  readonly client: TRaw;
  /** Framework ORM instance built over the raw client (e.g. Drizzle). Set by createAppRuntime. */
  readonly orm?: TOrm;
  close?(): Promise<void>;
}
