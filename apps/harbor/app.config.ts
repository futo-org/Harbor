import type { ConfigContext, ExpoConfig } from 'expo/config';
import fs from 'fs';
// Written by tools/icons/generate-icons.ts from icons.yaml
import accentByVariant from './src/common/assets/images/app-icons/variant-accents.json';

const { version: PKG_VERSION } = require('./package.json');
const { appLinks } = require('./appLinks');

// 'dev' | 'staging' | 'production'. Staging comes from the eas.json
// profile env; dev from the local scripts.
const VARIANT = process.env.APP_VARIANT ?? 'production';

// 'apk' | 'store'. Store builds (Play/App Store) must not self-update —
// Play App Signing uses a different certificate, so a sideloaded APK
// can never install over them.
const DISTRIBUTION = process.env.APP_DISTRIBUTION ?? 'apk';
const IS_DEV = VARIANT === 'dev';
const IS_STAGING = VARIANT === 'staging';

const NAME = IS_DEV ? 'Harbor Dev' : IS_STAGING ? 'Harbor Staging' : 'Harbor';
const ID = IS_DEV
  ? 'org.futo.polycentric.dev'
  : IS_STAGING
    ? 'org.futo.polycentric.staging'
    : 'org.futo.polycentric';

const SCHEME = IS_DEV ? 'harbor.dev' : IS_STAGING ? 'harbor.staging' : 'harbor';

const ICON_SUFFIX = IS_DEV ? '-dev' : IS_STAGING ? '-staging' : '';
// Unknown variants fall back to production, like the values above
const ACCENT =
  (accentByVariant as Record<string, string | undefined>)[VARIANT] ??
  accentByVariant.production;

// Web host whose links open this app (none for dev: verification needs a
// public HTTPS domain). Claims the whole host; appLinks.js excludes paths.
const APP_LINK_HOST: string | undefined = appLinks[VARIANT]?.host;

// Play builds get their own package so the store channel can never
// entangle with sideloaded installs (versionCodes and signatures stay
// fully independent). iOS keeps `ID` — the App Store app is bound to it.
const ANDROID_ID = !IS_DEV && DISTRIBUTION === 'store' ? `${ID}.store` : ID;

const GOOGLE_SERVICES_FILE =
  process.env.GOOGLE_SERVICES_JSON ?? './google-services.json';
// The google-services gradle plugin fails the build when the file has no
// entry for the package, so skip it for uncovered variants.
const HAS_GOOGLE_SERVICES = (() => {
  try {
    const config = JSON.parse(fs.readFileSync(GOOGLE_SERVICES_FILE, 'utf8'));
    return (config.client ?? []).some(
      (client: {
        client_info?: { android_client_info?: { package_name?: string } };
      }) =>
        client.client_info?.android_client_info?.package_name === ANDROID_ID,
    );
  } catch {
    return false;
  }
})();

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: NAME,
  slug: 'polycentric',
  version: process.env.APP_VERSION || PKG_VERSION || '0.0.1',
  orientation: 'default',
  scheme: SCHEME,
  web: {
    output: 'server',
  },
  userInterfaceStyle: 'automatic',
  ios: {
    // An Icon Composer bundle: Xcode renders the Liquid Glass icon and the flat
    // ones for older iOS from it
    icon: `./src/common/assets/images/app-icons/ios-icon${ICON_SUFFIX}.icon`,
    requireFullScreen: true,
    supportsTablet: true,
    bundleIdentifier: ID,
    ...(APP_LINK_HOST && { associatedDomains: [`applinks:${APP_LINK_HOST}`] }),
    infoPlist: {
      NSCameraUsageDescription: '$(PRODUCT_NAME) needs access to your Camera.',
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    adaptiveIcon: {
      foregroundImage: `./src/common/assets/images/app-icons/android-icon-foreground${ICON_SUFFIX}.png`,
      monochromeImage:
        './src/common/assets/images/app-icons/android-icon-monochrome.png',
      backgroundImage: `./src/common/assets/images/app-icons/android-icon-background${ICON_SUFFIX}.png`,
    },
    package: ANDROID_ID,
    permissions: [
      'android.permission.CAMERA',
      // Self-updater hands downloaded APKs to the system installer.
      'android.permission.REQUEST_INSTALL_PACKAGES',
    ],
    ...(HAS_GOOGLE_SERVICES && { googleServicesFile: GOOGLE_SERVICES_FILE }),
    ...(APP_LINK_HOST && {
      intentFilters: [
        {
          action: 'VIEW',
          autoVerify: true,
          data: [{ scheme: 'https', host: APP_LINK_HOST }],
          category: ['BROWSABLE', 'DEFAULT'],
        },
      ],
    }),
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
        image: './src/common/assets/images/app-icons/splash-icon.png',
        // The full 288 dp canvas of the Android 12 splash icon
        imageWidth: 288,
        resizeMode: 'contain',
        // splash-icon.png is only drawn over production's accent
        backgroundColor: accentByVariant.production,
        dark: {
          image: './src/common/assets/images/app-icons/splash-icon-dark.png',
          // darkPalette.neutral_0, the app's dark background
          backgroundColor: '#0D1016',
        },
      },
    ],
    [
      'expo-font',
      {
        // Native families are the file names on Android and the PostScript
        // (NotoSans) or family (Twemoji) names on iOS.
        fonts: ['Regular', 'SemiBold', 'Bold'].flatMap((face) => [
          `./src/common/assets/fonts/NotoSans-${face}.ttf`,
          `./src/common/assets/fonts/NotoSansMono-${face}.ttf`,
        ]),
        ios: { fonts: ['./src/common/assets/fonts/Twemoji.ttf'] },
        // The bitmap build is for Android 7-9 (see `twemojiFontFamily`).
        android: {
          fonts: [
            './src/common/assets/fonts/Twemoji.ttf',
            './src/common/assets/fonts/TwemojiCbdt.ttf',
          ],
        },
      },
    ],
    'expo-sqlite',
    'expo-web-browser',
    [
      'expo-dev-client',
      {
        launchMode: 'most-recent',
        // The generated scheme is slug-based, so all variants would claim it.
        addGeneratedScheme: false,
      },
    ],
    [
      'expo-build-properties',
      {
        android: {
          buildArchs: ['arm64-v8a'],
          // Needed for local Release builds to be able to talk to
          // http:// local servers on a LAN IP (e.g. for running e2e tests locally)
          usesCleartextTraffic: IS_DEV,
        },
      },
    ],
    'expo-image',
    [
      'expo-notifications',
      {
        icon: './src/common/assets/images/app-icons/android-notification-icon.png',
        color: ACCENT,
      },
    ],
    [
      'expo-screen-orientation',
      {
        initialOrientation: 'DEFAULT',
      },
    ],
    './plugins/withDisableForceDark',
    './plugins/withDisableEmojiCompat',
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    router: {},
    variant: VARIANT,
    distribution: DISTRIBUTION,
    eas: {
      projectId: '4db035ec-2de9-448a-a6cf-07347d6ae8b9',
    },
  },
  owner: 'futo-org',
});
