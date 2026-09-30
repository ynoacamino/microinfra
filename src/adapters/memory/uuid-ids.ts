import type { IdsPort } from "../../ports/ids";

export function createUuidIds(): IdsPort {
  return {
    createId: () => crypto.randomUUID(),
  };
}
