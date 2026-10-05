//#region src/runtime/singleton.ts
const PREFIX = "__microinfra_";
/**
* Process-wide singleton keyed by name. Survives Vite/Nitro dev HMR and
* serverless module re-evaluation because state lives on globalThis.
*/
function once(key, init) {
	const store = globalThis;
	const namespaced = `${PREFIX}${key}__`;
	const existing = store[namespaced];
	if (existing !== void 0) return existing;
	const value = init();
	store[namespaced] = value;
	return value;
}

//#endregion
export { once as t };
//# sourceMappingURL=singleton-Bej6xtaw.js.map