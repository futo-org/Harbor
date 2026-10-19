import { publicEnv } from '@/src/common/util/env';
import Constants from 'expo-constants';

export const APP_NAME = 'Harbor';

export const WEB_MAX_CONTENT_WIDTH = 600;

export const DEFAULT_IDENTITY_NAME = 'Anonymous';

export const FUTO_URL = 'https://futo.tech';
export const SOURCE_CODE_URL = 'https://code.futo.org/harbor/harbor';
export const ROADMAP_URL = 'https://join.harbor.social/docs/roadmap/';
export const PRIVACY_POLICY_URL =
  'https://join.harbor.social/docs/privacy-policy/';
/**
 * Content policy for the FUTO servers. Builds installed from Google Play or
 * the App Store are bound by the stricter app store policy instead (see
 * `APP_DISTRIBUTION` in app.config.ts).
 */
export const CONTENT_POLICY_URL =
  Constants.expoConfig?.extra?.distribution === 'store'
    ? 'https://join.harbor.social/docs/content-policy-app-stores/'
    : 'https://join.harbor.social/docs/content-policy/';
export const REPORT_BUG_URL = 'https://chat.futo.org/login/';

/**
 * Public web base URL for this app, used to build shareable links (e.g. to a
 * verification claim). Override with EXPO_PUBLIC_HARBOR_APP_URL; trailing
 * slashes are stripped so callers can append paths directly.
 */
export const HARBOR_APP_URL = (
  publicEnv(
    'EXPO_PUBLIC_HARBOR_APP_URL',
    process.env.EXPO_PUBLIC_HARBOR_APP_URL,
  ) ?? 'https://harbor.social'
).replace(/\/+$/, '');

/**
 * Public base URL of the static-assets bucket. APK update feeds live under
 * `apk/<channel>/`. Override with EXPO_PUBLIC_HARBOR_STATIC_URL.
 */
export const HARBOR_STATIC_URL = (
  publicEnv(
    'EXPO_PUBLIC_HARBOR_STATIC_URL',
    process.env.EXPO_PUBLIC_HARBOR_STATIC_URL,
  ) ?? 'https://static.harbor.social'
).replace(/\/+$/, '');
