export interface ObjectPutOptions {
  contentType: string;
  metadata?: Record<string, string>;
}

export interface ObjectPort {
  put(key: string, body: Uint8Array | ReadableStream, options: ObjectPutOptions): Promise<string>;
  delete(key: string): Promise<void>;
  read(key: string): Promise<Uint8Array>;
  getSignedUrl(key: string, expiresIn?: number): Promise<string>;
  getPublicUrl(key: string): string;
  generateKey(prefix: string): string;
}
