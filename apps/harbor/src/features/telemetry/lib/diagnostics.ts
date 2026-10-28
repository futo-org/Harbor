import { isWeb } from '@/src/common/util/platform';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

export interface Diagnostics {
  app: string;
  version: string;
  build: string | null;
  variant: string | null;
  platform: string;
  osVersion: string | null;
  device: string | null;
}

export function appVersion(): string {
  const version = isWeb
    ? Constants.expoConfig?.version
    : Application.nativeApplicationVersion;
  return version ?? 'unknown';
}

export function collectDiagnostics(): Diagnostics {
  return {
    app: Application.applicationId ?? Constants.expoConfig?.slug ?? 'harbor',
    version: appVersion(),
    build: isWeb ? null : Application.nativeBuildVersion,
    variant: Constants.expoConfig?.extra?.variant ?? null,
    platform: Platform.OS,
    osVersion: isWeb
      ? typeof navigator === 'undefined'
        ? null
        : navigator.userAgent
      : Device.osVersion,
    device: isWeb ? null : Device.modelName,
  };
}
