import { z } from "zod";

//#region src/core/registry.ts
function createInfra(options) {
	const runtime = { ...options };
	if (options.mode === "node" && !runtime.close) {
		const dbClose = options.db.close;
		if (dbClose) runtime.close = () => dbClose.call(options.db);
	}
	return Object.freeze(runtime);
}

//#endregion
//#region src/schema/env-schema.ts
const envSchema = z.object({
	NODE_ENV: z.enum([
		"development",
		"production",
		"test"
	]).default("development"),
	BACKEND_URL: z.string().default("http://localhost:7000"),
	PORT: z.coerce.number().int().positive().default(7e3),
	DATABASE_URL: z.string().optional(),
	DATABASE_AUTH_TOKEN: z.string().optional(),
	S3_ACCESS_KEY_ID: z.string().default(""),
	S3_SECRET_ACCESS_KEY: z.string().default(""),
	S3_REGION: z.string().default("us-east-1"),
	S3_BUCKET_NAME: z.string().default("crop-media"),
	S3_ENDPOINT: z.string().default(""),
	S3_PUBLIC_URL: z.string().default(""),
	S3_FORCE_PATH_STYLE: z.union([z.boolean(), z.string()]).transform((val) => val === "true" || val === true).default(false),
	UPSTASH_REDIS_REST_URL: z.string().optional(),
	UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
	CORS_ORIGINS: z.string().optional(),
	TRUSTED_ORIGINS: z.string().optional(),
	EXPORT_MAX_ROWS: z.coerce.number().int().min(100).default(5e4),
	IMPORT_MAX_FILE_MB: z.coerce.number().int().min(1).default(10),
	DEV_SEED_TOKEN: z.string().optional()
});
function parseOrigins(raw) {
	return raw?.split(",").map((origin) => origin.trim()).filter((origin) => origin.length > 0) ?? [];
}
function createEnvConfig(env) {
	const result = envSchema.safeParse(env.all());
	if (!result.success) {
		const errorMsg = result.error.issues[0]?.message ?? "Error en las variables de entorno";
		throw new Error(`[env] ${errorMsg}`);
	}
	const data = result.data;
	return {
		nodeEnv: data.NODE_ENV,
		backendUrl: data.BACKEND_URL,
		port: data.PORT,
		corsOrigins: parseOrigins(data.CORS_ORIGINS),
		trustedOrigins: parseOrigins(data.TRUSTED_ORIGINS),
		database: {
			url: data.DATABASE_URL,
			authToken: data.DATABASE_AUTH_TOKEN
		},
		s3: {
			accessKeyId: data.S3_ACCESS_KEY_ID,
			secretAccessKey: data.S3_SECRET_ACCESS_KEY,
			region: data.S3_REGION,
			bucket: data.S3_BUCKET_NAME,
			endpoint: data.S3_ENDPOINT,
			publicUrl: data.S3_PUBLIC_URL,
			forcePathStyle: data.S3_FORCE_PATH_STYLE
		},
		redis: {
			url: data.UPSTASH_REDIS_REST_URL,
			token: data.UPSTASH_REDIS_REST_TOKEN
		},
		export: { maxRows: data.EXPORT_MAX_ROWS },
		import: { maxFileMb: data.IMPORT_MAX_FILE_MB },
		dev: { seedToken: data.DEV_SEED_TOKEN }
	};
}

//#endregion
export { createInfra as n, createEnvConfig as t };
//# sourceMappingURL=env-schema-CHblobMd.js.map