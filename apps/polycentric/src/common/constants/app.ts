/**
 * Public web base URL for this app, used to build shareable links (e.g. to a
 * verification claim). Override with EXPO_PUBLIC_POLYCENTRIC_APP_URL; trailing
 * slashes are stripped so callers can append paths directly.
 */
export const POLYCENTRIC_APP_URL = (
  process.env.EXPO_PUBLIC_POLYCENTRIC_APP_URL ?? 'https://polycentric.io'
).replace(/\/+$/, '');
