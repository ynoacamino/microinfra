export type NullToUndefined<T> =
  T extends Record<string, unknown>
    ? {
        [K in keyof T]: NullToUndefined<Exclude<T[K], null>>;
      }
    : Exclude<T, null>;

// Convierte null → undefined en profundidad (objetos y arreglos).
// Se aplica a los args ya validados por zod antes de drizzle:
// GraphQL entrega null y drizzle espera undefined.
export function sanitize<T>(obj: T): NullToUndefined<T> {
  return sanitizeValue(obj) as NullToUndefined<T>;
}

function sanitizeValue(obj: unknown): unknown {
  if (obj === null) {
    return undefined;
  }
  if (typeof obj !== "object") {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeValue(item));
  }
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    result[key] = sanitizeValue(value);
  }
  return result;
}
