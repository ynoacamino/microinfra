import type { EnvPort } from "../../ports/env";

function readProcessEnv(): Record<string, string | undefined> {
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  return proc?.env ? { ...proc.env } : {};
}

export class NodeEnv implements EnvPort {
  private readonly vars: Record<string, string | undefined>;

  constructor(vars?: Record<string, string | undefined>) {
    this.vars = vars ?? readProcessEnv();
  }

  get(key: string): string | undefined {
    return this.vars[key];
  }

  getRequired(key: string): string {
    const value = this.vars[key];
    if (value === undefined) throw new Error(`[env] Missing required key: ${key}`);
    return value;
  }

  all(): Record<string, string | undefined> {
    return { ...this.vars };
  }

  static isConfigured(): boolean {
    return true;
  }
}
