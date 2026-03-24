/**
 * No-op on native; head tags are only needed for web.
 * Web uses GlobalHead.web.tsx which injects favicon and OG meta.
 */
export function GlobalHead() {
  return null;
}
