import type { ObjectPort, ObjectPutOptions } from "../../ports/object-storage";
import type { CfBindings } from "./cf-env";

export function isR2Configured(bindings?: CfBindings): boolean {
  return Boolean(bindings?.MY_BUCKET);
}

export function createR2Port(deps: { port: ObjectPort }): ObjectPort {
  return deps.port;
}

export interface R2GetResult {
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface R2Binding {
  put(key: string, body: Uint8Array | ReadableStream, options?: Record<string, unknown>): Promise<unknown>;
  get(key: string): Promise<R2GetResult | null>;
  delete(key: string): Promise<void>;
}

export interface R2PortOptions {
  ids?: () => string;
  publicUrl?: string;
}

export function putOptions(contentType: string, metadata?: Record<string, string>): Record<string, unknown> {
  return {
    httpMetadata: { contentType },
    customMetadata: metadata ?? {},
  };
}

export class R2Objects implements ObjectPort {
  private readonly bucket: R2Binding;
  private readonly ids: () => string;
  private readonly publicUrl: string;

  constructor(bucket: R2Binding, opts: R2PortOptions = {}) {
    this.bucket = bucket;
    this.ids = opts.ids ?? (() => crypto.randomUUID());
    this.publicUrl = (opts.publicUrl ?? "").replace(/\/$/, "");
  }

  async put(key: string, body: Uint8Array | ReadableStream, options: ObjectPutOptions): Promise<string> {
    await this.bucket.put(key, body, putOptions(options.contentType, options.metadata));
    return this.getPublicUrl(key);
  }

  async delete(key: string): Promise<void> {
    await this.bucket.delete(key);
  }

  async read(key: string): Promise<Uint8Array> {
    const object = await this.bucket.get(key);
    if (!object) throw new Error(`R2 read failed: missing ${key}`);
    return new Uint8Array(await object.arrayBuffer());
  }

  async getSignedUrl(key: string): Promise<string> {
    return this.getPublicUrl(key);
  }

  getPublicUrl(key: string): string {
    return this.publicUrl ? `${this.publicUrl}/${key}` : `r2://${key}`;
  }

  generateKey(prefix: string): string {
    return `${prefix}/${this.ids()}`;
  }
}

export function createR2PortFromBinding(bucket: R2Binding, opts: R2PortOptions = {}): ObjectPort {
  return new R2Objects(bucket, opts);
}
