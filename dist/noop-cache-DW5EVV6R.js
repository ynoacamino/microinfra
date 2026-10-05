//#region src/adapters/memory/map-env.ts
function createMapEnv(seed = {}) {
	const map = new Map(Object.entries(seed));
	return {
		get: (key) => map.get(key),
		getRequired: (key) => {
			const value = map.get(key);
			if (value === void 0) throw new Error(`[env] Missing required key: ${key}`);
			return value;
		},
		all: () => Object.fromEntries(map)
	};
}

//#endregion
//#region src/adapters/memory/noop-cache.ts
function createNoopCache() {
	return {
		get: async () => null,
		put: async () => {},
		delete: async () => {},
		list: async () => []
	};
}

//#endregion
export { createMapEnv as n, createNoopCache as t };
//# sourceMappingURL=noop-cache-DW5EVV6R.js.map