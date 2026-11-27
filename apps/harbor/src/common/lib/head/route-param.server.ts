/** A route param as one string. Catch-all segments are joined back into a path */
export function routeParam(
  params: Record<string, string | string[]>,
  name: string,
): string {
  const value = params[name];
  return (Array.isArray(value) ? value.join('/') : value) ?? '';
}
