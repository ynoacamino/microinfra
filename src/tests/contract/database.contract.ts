import { describe, expect, it } from "vitest";
import type { DatabasePort } from "../../ports/database";

export function describeDatabaseContract(
  name: string,
  makeDb: () => DatabasePort<unknown> | Promise<DatabasePort<unknown>>,
): void {
  describe(`DatabasePort contract [${name}]`, () => {
    it("exposes a client and an optional close", async () => {
      const db = await makeDb();
      expect(db.client).toBeDefined();
      if (db.close) {
        await expect(db.close()).resolves.toBeUndefined();
      }
    });
  });
}
