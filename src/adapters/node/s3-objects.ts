import { AwsClient } from "aws4fetch";
import type { EnvConfig } from "../../ports/config";
import type { ObjectPort, ObjectPutOptions } from "../../ports/object-storage";

const SIGNED_URL_EARLY_REFRESH_SEC = 300;
const SIGNED_URL_CACHE_MAX_ENTRIES = 500;
const SIGNED_URL_MIN_MAX_AGE_SEC = 60;

interface SignedUrlCacheEntry {
  url: string;
  expiresAtMs: number;
}

export interface S3PortOptions {
  ids?: () => string;
}

export function isS3Configured(config: EnvConfig): boolean {
  return Boolean(config.s3.accessKeyId && config.s3.secretAccessKey && (config.s3.endpoint || config.s3.bucket));
}

export class S3Objects implements ObjectPort {
  private readonly client: AwsClient;
  private readonly bucket: string;
  private readonly region: string;
  private readonly endpoint: string;
  private readonly publicUrl: string;
  private readonly forcePathStyle: boolean;
  private readonly ids: () => string;
  private readonly signedUrlCache = new Map<string, SignedUrlCacheEntry>();

  constructor(config: EnvConfig, opts: S3PortOptions = {}) {
    this.ids = opts.ids ?? (() => crypto.randomUUID());
    this.client = new AwsClient({
      accessKeyId: config.s3.accessKeyId,
      secretAccessKey: config.s3.secretAccessKey,
      service: "s3",
      region: config.s3.region,
    });
    this.bucket = config.s3.bucket;
    this.region = config.s3.region;
    this.endpoint = config.s3.endpoint;
    this.publicUrl = config.s3.publicUrl;
    this.forcePathStyle = config.s3.forcePathStyle;
  }

  private getInternalUrl(): string {
    const normalized = this.endpoint.replace(/\/$/, "");
    if (this.forcePathStyle) {
      return `${normalized}/${this.bucket}`;
    }
    const host = normalized.replace(/^https?:\/\//, "");
    return `https://${this.bucket}.${host}`;
  }

  private getExternalUrl(): string {
    if (this.publicUrl) {
      return this.publicUrl.replace(/\/$/, "");
    }
    return this.getInternalUrl();
  }

  async put(key: string, body: Uint8Array | ReadableStream, options: ObjectPutOptions): Promise<string> {
    const url = `${this.getInternalUrl()}/${key}`;
    const headers: Record<string, string> = { "Content-Type": options.contentType };
    if (options.metadata) {
      for (const [name, value] of Object.entries(options.metadata)) {
        headers[`x-amz-meta-${name}`] = value;
      }
    }
    const response = await this.client.fetch(url, {
      method: "PUT",
      headers,
      body: body as BodyInit,
      aws: { service: "s3", region: this.region },
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`S3 upload failed: ${response.status} ${errorText}`);
    }
    return this.getPublicUrl(key);
  }

  async delete(key: string): Promise<void> {
    for (const cacheKey of [...this.signedUrlCache.keys()]) {
      if (cacheKey.startsWith(`${key}|`)) {
        this.signedUrlCache.delete(cacheKey);
      }
    }
    const url = `${this.getInternalUrl()}/${key}`;
    const response = await this.client.fetch(url, {
      method: "DELETE",
      aws: { service: "s3", region: this.region },
    });
    if (!response.ok && response.status !== 404) {
      const errorText = await response.text();
      throw new Error(`S3 delete failed: ${response.status} ${errorText}`);
    }
  }

  async read(key: string): Promise<Uint8Array> {
    const url = `${this.getInternalUrl()}/${key}`;
    const response = await this.client.fetch(url, {
      method: "GET",
      aws: { service: "s3", region: this.region },
    });
    if (!response.ok) {
      throw new Error(`S3 read failed: ${response.status} ${key}`);
    }
    return new Uint8Array(await response.arrayBuffer());
  }

  async getSignedUrl(key: string, expiresIn = 3600): Promise<string> {
    const cacheKey = `${key}|${expiresIn}`;
    const cached = this.signedUrlCache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAtMs - SIGNED_URL_EARLY_REFRESH_SEC * 1000) {
      return cached.url;
    }
    const maxAge = Math.max(expiresIn - SIGNED_URL_EARLY_REFRESH_SEC, SIGNED_URL_MIN_MAX_AGE_SEC);
    const url = new URL(`${this.getExternalUrl()}/${key}`);
    url.searchParams.set("X-Amz-Expires", String(expiresIn));
    url.searchParams.set("response-cache-control", `public, max-age=${maxAge}`);
    const request = await this.client.sign(url.toString(), {
      method: "GET",
      aws: { service: "s3", region: this.region, signQuery: true },
    });
    const signedUrl = request.url.toString();
    if (this.signedUrlCache.size >= SIGNED_URL_CACHE_MAX_ENTRIES) {
      const oldest = this.signedUrlCache.keys().next();
      if (!oldest.done) {
        this.signedUrlCache.delete(oldest.value);
      }
    }
    this.signedUrlCache.set(cacheKey, { url: signedUrl, expiresAtMs: Date.now() + expiresIn * 1000 });
    return signedUrl;
  }

  getPublicUrl(key: string): string {
    return `${this.getExternalUrl()}/${key}`;
  }

  generateKey(prefix: string): string {
    return `${prefix}/${this.ids()}`;
  }
}

export function createS3Port(config: EnvConfig, opts: S3PortOptions = {}): ObjectPort {
  return new S3Objects(config, opts);
}
