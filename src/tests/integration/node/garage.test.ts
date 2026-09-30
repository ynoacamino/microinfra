import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMapEnv } from "../../../adapters/memory/map-env";
import { createS3Port, isS3Configured } from "../../../adapters/node/s3-objects";
import { createEnvConfig } from "../../../schema/env-schema";
import { describeObjectsContract } from "../../contract/objects.contract";
import { type GarageStack, startGarage } from "./containers";

let stack!: GarageStack;

beforeAll(async () => {
  stack = await startGarage();
}, 180_000);

afterAll(async () => {
  await stack.stop();
});

function garageConfig() {
  return createEnvConfig(
    createMapEnv({
      S3_ACCESS_KEY_ID: stack.accessKeyId,
      S3_SECRET_ACCESS_KEY: stack.secretAccessKey,
      S3_REGION: "garage",
      S3_BUCKET_NAME: stack.bucket,
      S3_ENDPOINT: stack.endpoint,
      S3_FORCE_PATH_STYLE: "true",
    }),
  );
}

describe("garage stack", () => {
  it("detects the containerized S3 endpoint", () => {
    expect(isS3Configured(garageConfig())).toBe(true);
  });

  it("returns public urls rooted at the container endpoint", async () => {
    const objects = createS3Port(garageConfig());
    const key = objects.generateKey("probe");
    await objects.put(key, new TextEncoder().encode("probe"), { contentType: "text/plain" });
    expect(objects.getPublicUrl(key)).toBe(`${stack.endpoint}/${stack.bucket}/${key}`);
    await objects.delete(key);
  });
});

describeObjectsContract("garage-s3", () => createS3Port(garageConfig()));
