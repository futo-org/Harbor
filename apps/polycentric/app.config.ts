import type { ConfigContext, ExpoConfig } from 'expo/config';
import fs from 'fs';

const IS_DEV = process.env.APP_VARIANT === 'dev';

const NAME = IS_DEV ? 'Polycentric Dev' : 'Polycentric';
const ID = IS_DEV ? 'org.futo.polycentric.dev' : 'org.futo.polycentric';

const GOOGLE_SERVICES_FILE =
  process.env.GOOGLE_SERVICES_JSON ?? './google-services.json';
const HAS_GOOGLE_SERVICES = fs.existsSync(GOOGLE_SERVICES_FILE);

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: NAME,
  slug: 'polycentric',
  version: '0.0.1',
  orientation: 'portrait',
  icon: './src/common/assets/images/AppIcon.png',
  scheme: 'polycentric',
  web: {
    output: 'server',
  },
  userInterfaceStyle: 'automatic',
  ios: {
    supportsTablet: true,
    bundleIdentifier: ID,
    infoPlist: {
      NSCameraUsageDescription: '$(PRODUCT_NAME) needs access to your Camera.',
    },
    entitlements: {
      'aps-environment': 'production',
    },
  },
  android: {
    adaptiveIcon: {
      foregroundImage: './src/common/assets/images/AppIcon.png',
      backgroundColor: '#ffffff',
    },
    edgeToEdgeEnabled: true,
    package: ID,
    permissions: ['android.permission.CAMERA'],
    ...(HAS_GOOGLE_SERVICES && { googleServicesFile: GOOGLE_SERVICES_FILE }),
  },
  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      {
        image: './src/common/assets/images/AppIcon.png',
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
          usesCleartextTraffic: true,
        },
      },
    ],
    'expo-image',
    'expo-notifications',
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
