export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LoggerPort {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(
    message: string,
    errorOrData?: Error | Record<string, unknown> | unknown,
    extraData?: Record<string, unknown>,
  ): void;
  child(contextName: string): LoggerPort;
}
