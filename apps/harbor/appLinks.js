const APPLE_TEAM_ID = '2W7AC6T8T5';

const APP_LINK_PATH_RULES = [{ '/': '/oauth/*', exclude: true }, { '/': '*' }];

const appLinks = {
  production: {
    host: 'harbor.social',
    iosBundleId: 'org.futo.polycentric',
    androidApps: [
      {
        packageName: 'org.futo.polycentric',
        sha256CertFingerprints: [
          'A9:E6:AD:3F:79:DA:10:FD:E0:AC:CE:95:A5:47:C2:6F:26:78:E2:A0:6A:51:1E:05:5B:8C:3B:B4:59:CC:D9:2E',
        ],
      },
      {
        packageName: 'org.futo.polycentric.store',
        sha256CertFingerprints: [
          'C7:20:B7:50:A1:F9:A2:4B:C9:44:8F:A0:1A:18:11:BE:0B:8B:75:6E:D2:9E:CF:0D:11:82:81:7F:6D:BC:00:B5',
        ],
      },
    ],
  },
  staging: {
    host: 'staging.harbor.social',
    iosBundleId: 'org.futo.polycentric.staging',
    androidApps: [
      {
        packageName: 'org.futo.polycentric.staging',
        sha256CertFingerprints: [
          '39:AC:18:C7:95:6F:89:AC:C7:86:74:E9:0D:6C:B8:AA:8E:4D:61:B5:E8:B3:E2:0B:65:92:70:45:B6:5D:66:EA',
        ],
      },
      {
        packageName: 'org.futo.polycentric.staging.store',
        sha256CertFingerprints: [
          '32:71:BA:CF:B4:2F:E2:78:46:39:31:95:03:E9:8B:69:76:94:F4:91:29:78:4F:44:87:84:46:AC:2D:8A:06:6F',
        ],
      },
    ],
  },
};

function buildAppleAppSiteAssociation(host) {
  const appLink = findAppLinkByHost(host);
  if (!appLink) return null;

  return {
    applinks: {
      details: [
        {
          appIDs: [`${APPLE_TEAM_ID}.${appLink.iosBundleId}`],
          components: APP_LINK_PATH_RULES,
        },
      ],
    },
  };
}

function buildAssetLinks(host) {
  const appLink = findAppLinkByHost(host);
  if (!appLink) return null;

  return appLink.androidApps.map((androidApp) => ({
    relation: ['delegate_permission/common.handle_all_urls'],
    target: {
      namespace: 'android_app',
      package_name: androidApp.packageName,
      sha256_cert_fingerprints: androidApp.sha256CertFingerprints,
    },
    relation_extensions: {
      'delegate_permission/common.handle_all_urls': {
        dynamic_app_link_components: APP_LINK_PATH_RULES,
      },
    },
  }));
}

function findAppLinkByHost(host) {
  return Object.values(appLinks).find((appLink) => appLink.host === host);
}

module.exports = { appLinks, buildAppleAppSiteAssociation, buildAssetLinks };
