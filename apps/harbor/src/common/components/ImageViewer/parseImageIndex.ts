/**
 * Parse the 1-based `index` URL param into a 0-based array index,
 * clamping junk (and out-of-range values) to the nearest valid image.
 */
export function parseImageIndex(param: string, count: number): number {
  const parsed = Number.parseInt(param, 10);
  if (Number.isNaN(parsed)) return 0;
  return Math.min(Math.max(parsed - 1, 0), Math.max(count - 1, 0));
}
