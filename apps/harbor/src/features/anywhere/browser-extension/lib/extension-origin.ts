const EXTENSION_ORIGIN = /^(chrome|moz|safari-web)-extension:\/\//;

/**
 * Whether a message came from an extension page framing the app. Any site
 * can frame the panel route, so nothing else is to be believed.
 */
export function isFromExtension(event: MessageEvent): boolean {
  return event.source === window.parent && EXTENSION_ORIGIN.test(event.origin);
}
