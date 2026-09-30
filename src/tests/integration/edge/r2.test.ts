import { env } from "cloudflare:test";
import { createR2PortFromBinding, type R2Binding } from "../../../adapters/edge/r2-objects";
import { describeObjectsContract } from "../../contract/objects.contract";

describeObjectsContract("r2", () => createR2PortFromBinding(env.MY_BUCKET as unknown as R2Binding));
