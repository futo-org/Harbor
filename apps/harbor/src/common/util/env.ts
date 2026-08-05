/**
 * Public env with runtime override (injected by server.js on web). Pass the
 * build-time value — Metro only inlines static `process.env.EXPO_PUBLIC_*`
 * reads.
 */
export function publicEnv(
  key: string,
  buildTimeValue?: string,
): string | undefined {
  const runtime = (
    globalThis as { __POLYCENTRIC_ENV__?: Record<string, string | undefined> }
  ).__POLYCENTRIC_ENV__;
  return runtime?.[key] ?? buildTimeValue;
}
