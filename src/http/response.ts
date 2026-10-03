/**
 * Re-wraps a Response as a native global Response. Frameworks (Yoga, Hono)
 * may return cross-realm Response objects that break `instanceof` checks in
 * adapters like TanStack Start; re-wrapping fixes the prototype chain.
 * Note: buffers the body, so it is not suitable for SSE/streaming responses.
 */
export async function toNativeResponse(res: Response): Promise<Response> {
  const headers = new Headers();
  res.headers.forEach((value, key) => {
    headers.append(key, value);
  });
  const buffer = await res.arrayBuffer();
  return new Response(buffer.byteLength === 0 ? null : buffer, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}
