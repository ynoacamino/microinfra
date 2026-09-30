export interface EnvPort {
  get(key: string): string | undefined;
  getRequired(key: string): string;
  all(): Record<string, string | undefined>;
}
