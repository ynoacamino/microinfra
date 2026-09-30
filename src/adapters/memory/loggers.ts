import type { LoggerPort } from "../../ports/logger";

function noop(): void {}

export function createNoopLogger(): LoggerPort {
  const logger: LoggerPort = {
    debug: noop,
    info: noop,
    warn: noop,
    error: noop,
    child: () => logger,
  };
  return logger;
}

export function createConsoleLogger(context = "App"): LoggerPort {
  const prefix = `[microinfra:${context}]`;
  const make = (scope: string): LoggerPort =>
    ({
      debug: (message, data) => console.debug(prefix, scope, message, data ?? ""),
      info: (message, data) => console.info(prefix, scope, message, data ?? ""),
      warn: (message, data) => console.warn(prefix, scope, message, data ?? ""),
      error: (message, errorOrData, extra) => console.error(prefix, scope, message, errorOrData ?? "", extra ?? ""),
      child: (name) => make(`${scope}:${name}`),
    }) as LoggerPort;
  return make(context);
}
