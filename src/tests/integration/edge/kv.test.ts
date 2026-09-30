import { env } from "cloudflare:test";
import { createKvCache, type KvBinding } from "../../../adapters/edge/kv-cache";
import { describeCacheContract } from "../../contract/cache.contract";

describeCacheContract("kv", () => createKvCache(env.KV as unknown as KvBinding));
