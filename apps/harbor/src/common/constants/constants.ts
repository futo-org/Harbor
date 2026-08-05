import { publicEnv } from '@/src/common/util/env';

export const APP_NAME = 'Harbor';

export const WEB_MAX_CONTENT_WIDTH = 600;

export const DEFAULT_IDENTITY_NAME = 'Anon';

export const FUTO_URL = 'https://futo.tech';
export const SOURCE_CODE_URL =
  'https://gitlab.futo.org/polycentric/polycentric';
export const REPORT_BUG_URL = 'https://chat.futo.org/login/';

/**
 * Public web base URL for this app, used to build shareable links (e.g. to a
 * verification claim). Override with EXPO_PUBLIC_POLYCENTRIC_APP_URL; trailing
 * slashes are stripped so callers can append paths directly.
 */
export const POLYCENTRIC_APP_URL = (
  publicEnv(
    'EXPO_PUBLIC_POLYCENTRIC_APP_URL',
    process.env.EXPO_PUBLIC_POLYCENTRIC_APP_URL,
  ) ?? 'https://harbor.social'
).replace(/\/+$/, '');
