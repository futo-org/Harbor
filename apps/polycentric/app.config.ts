import type { ExpoConfig, ConfigContext } from 'expo/config';

const { version: PKG_VERSION } = require('./package.json');

const IS_DEV = process.env.APP_VARIANT === 'dev';

const NAME = IS_DEV ? 'Polycentric Dev' : 'Polycentric';
const ID = IS_DEV ? 'org.futo.polycentric.dev' : 'org.futo.polycentric';

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
    entitlements: {
      'aps-environment': 'production',
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
      backgroundColor: '#F2F5F9',
    },
    package: ID,
    permissions: ['android.permission.CAMERA'],
  },
  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      {
        image: './src/common/assets/images/app-icons/ios-icon-default.png',
        imageWidth: 200,
        resizeMode: 'contain',
        backgroundColor: '#F2F5F9',
      },
    ],
    'expo-font',
    'expo-web-browser',
    [
      'react-native-vision-camera',
      {
        cameraPermissionText: '$(PRODUCT_NAME) needs access to your Camera.',
        enableLocation: false,
      },
    ],
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
