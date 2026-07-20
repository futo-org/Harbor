import type { ConfigContext, ExpoConfig } from 'expo/config';
import fs from 'fs';

const { version: PKG_VERSION } = require('./package.json');

const IS_DEV = process.env.APP_VARIANT === 'dev';

const NAME = IS_DEV ? 'Harbor Dev' : 'Harbor';
const ID = IS_DEV ? 'org.futo.polycentric.dev' : 'org.futo.polycentric';

const GOOGLE_SERVICES_FILE =
  process.env.GOOGLE_SERVICES_JSON ?? './google-services.json';
const HAS_GOOGLE_SERVICES = fs.existsSync(GOOGLE_SERVICES_FILE);

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: NAME,
  slug: 'polycentric',
  version: process.env.APP_VERSION ?? PKG_VERSION ?? '0.0.1',
  orientation: 'default',
  icon: './src/common/assets/images/app-icons/android-icon-foreground.png',
  scheme: 'polycentric',
  web: {
    output: 'server',
  },
  userInterfaceStyle: 'automatic',
  ios: {
    icon: {
      dark: './src/common/assets/images/app-icons/ios-icon-dark.png',
      light: './src/common/assets/images/app-icons/ios-icon-default.png',
      tinted: './src/common/assets/images/app-icons/ios-icon-monochrome.png',
    },
    requireFullScreen: true,
    supportsTablet: true,
    bundleIdentifier: ID,
    infoPlist: {
      NSCameraUsageDescription: '$(PRODUCT_NAME) needs access to your Camera.',
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    adaptiveIcon: {
      foregroundImage:
        './src/common/assets/images/app-icons/android-icon-foreground.png',
      monochromeImage:
        './src/common/assets/images/app-icons/android-icon-monochrome.png',
      backgroundImage:
        './src/common/assets/images/app-icons/android-icon-background.png',
      backgroundColor: '#FF6A00',
    },
    package: ID,
    permissions: ['android.permission.CAMERA'],
    ...(HAS_GOOGLE_SERVICES && { googleServicesFile: GOOGLE_SERVICES_FILE }),
  },
  plugins: [
    [
      'expo-router',
      {
        origin: 'https://harbor.social',
      },
    ],
    [
      'expo-splash-screen',
      {
        image: './src/common/assets/images/app-icons/ios-icon-default.png',
        imageWidth: 200,
        resizeMode: 'contain',
        backgroundColor: '#FF6A00',
      },
    ],
    'expo-font',
    'expo-sqlite',
    'expo-web-browser',
    [
      'expo-dev-client',
      {
        launchMode: 'most-recent',
      },
    ],
    [
      'expo-build-properties',
      {
        android: {
          buildArchs: ['arm64-v8a'],
        },
      },
    ],
    'expo-image',
    'expo-notifications',
    [
      'expo-screen-orientation',
      {
        initialOrientation: 'DEFAULT',
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    router: {},
    eas: {
      projectId: '4db035ec-2de9-448a-a6cf-07347d6ae8b9',
    },
  },
  owner: 'futo-org',
});
