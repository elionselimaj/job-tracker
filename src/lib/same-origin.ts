/** Stops other websites from triggering a paid sync from the user's browser. */
export function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return origin !== null && origin === new URL(request.url).origin;
}
