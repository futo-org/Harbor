import { publicEnv } from '@/src/common/util/env';
import { isBrowserExtension } from '@/src/common/util/platform';
import * as Application from 'expo-application';
import Constants from 'expo-constants';

/** Build variant. Web reads it at runtime since one image serves every environment. */
export const APP_VARIANT: string =
  publicEnv('EXPO_PUBLIC_APP_VARIANT', process.env.EXPO_PUBLIC_APP_VARIANT) ??
  Constants.expoConfig?.extra?.variant ??
  'production';

/** Installed from Google Play or the App Store (`APP_DISTRIBUTION` in eas.json). */
export const IS_STORE_BUILD =
  Constants.expoConfig?.extra?.distribution === 'store';

/** Same shape as the native ids in app.config.ts, with a `.web` suffix. */
export function webApplicationId(variant: string): string {
  const suffix = variant === 'production' ? '' : `.${variant}`;
  return `org.futo.polycentric${suffix}.web`;
}

/** Outside the Harbor ids, so its posts say they came from the extension. */
export function browserExtensionApplicationId(variant: string): string {
  const suffix = variant === 'production' ? '' : `.${variant}`;
  return `org.futo.harbor${suffix}.browser-extension`;
}

/** Stamped on every event this install authors. */
export const HARBOR_APPLICATION = {
  name: 'Harbor',
  id: Application.applicationId ?? webApplicationId(APP_VARIANT),
  version:
    Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? '',
  url: 'https://harbor.social',
  ...(isBrowserExtension && {
    name: 'Harbor Anywhere',
    id: browserExtensionApplicationId(APP_VARIANT),
    url: 'https://anywhere.harbor.social',
  }),
};
