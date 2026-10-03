import type { RuntimeEnv } from "../core/types";

export interface ServiceUser {
  id: string;
  email?: string | null;
  name?: string | null;
}

export interface ServiceContext<TDb = unknown> {
  db: TDb;
  runtime: RuntimeEnv;
  user: ServiceUser | null;
  request: Request;
}

/** Maps a better-auth style session to a ServiceUser (null when signed out). */
export function sessionUser(
  session: {
    user: { id: string; email?: string | null; name?: string | null };
  } | null,
): ServiceUser | null {
  if (!session?.user) {
    return null;
  }
  return {
    id: session.user.id,
    email: session.user.email ?? null,
    name: session.user.name ?? null,
  };
}

/** Builds the shared GraphQL/WS service context from a runtime. */
export function contextFromRuntime<TDb>(
  rt: RuntimeEnv,
  opts: { db: TDb; user: ServiceUser | null; request: Request },
): ServiceContext<TDb> {
  return { db: opts.db, runtime: rt, user: opts.user, request: opts.request };
}

/** Placeholder request for transports without one (e.g. WebSocket upgrade). */
export function syntheticRequest(url = "ws://internal"): Request {
  return new Request(url);
}
