import type { ExpoConfig, ConfigContext } from 'expo/config';

const IS_DEV = process.env.APP_VARIANT === 'dev';

const NAME = IS_DEV ? 'Polycentric Dev' : 'Polycentric';
const ID = IS_DEV ? 'org.futo.polycentric.dev' : 'org.futo.polycentric';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: NAME,
  slug: 'polycentric',
  version: '0.0.1',
  orientation: 'portrait',
  icon: './src/common/assets/images/PolycentricLogoWhite1024.png',
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
      foregroundImage: './src/common/assets/images/PolycentricLogoTransparent1024.png',
      backgroundColor: '#F2F5F9',
    },
    edgeToEdgeEnabled: true,
    package: ID,
    permissions: ['android.permission.CAMERA'],
  },
  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      {
        image: './src/common/assets/images/PolycentricLogoTransparent1024.png',
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
