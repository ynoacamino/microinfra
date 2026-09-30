export interface EnvConfig {
  nodeEnv: "development" | "production" | "test";
  backendUrl: string;
  port: number;
  corsOrigins: string[];
  trustedOrigins: string[];
  database: { url: string | undefined };
  s3: {
    accessKeyId: string;
    secretAccessKey: string;
    region: string;
    bucket: string;
    endpoint: string;
    publicUrl: string;
    forcePathStyle: boolean;
  };
  redis: { url: string | undefined; token: string | undefined };
  export: { maxRows: number };
  import: { maxFileMb: number };
  dev: { seedToken: string | undefined };
}
