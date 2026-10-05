//#region src/db/types.ts
/** Returns the typed orm or undefined (no throw). */
function ormOf(rt) {
	return rt.db.orm;
}
/** Returns the typed orm or throws with an actionable message. */
function requireOrm(rt) {
	const orm = ormOf(rt);
	if (!orm) throw new Error("[microinfra] DB orm no disponible (revisa DATABASE_URL o binding D1)");
	return orm;
}

//#endregion
export { requireOrm as n, ormOf as t };
//# sourceMappingURL=types-COGhPH3r.js.map