const fs = require('node:fs');
const path = require('node:path');
const { withDangerousMod } = require('expo/config-plugins');

const EXTENSION_POINT = '// Extension point for config plugins.';

// iPadOS 26+ draws the window controls as small as it can instead of as part
// of the app's content. Expo's scene delegate has no hook for this, so the
// method goes into the generated SceneDelegate.
function withMinimalWindowControls(config) {
  return withDangerousMod(config, [
    'ios',
    (config) => {
      const file = path.join(
        config.modRequest.platformProjectRoot,
        config.modRequest.projectName,
        'SceneDelegate.swift',
      );
      const source = fs.readFileSync(file, 'utf8');
      if (!source.includes(EXTENSION_POINT)) {
        throw new Error(
          `withMinimalWindowControls: no extension point in ${file}`,
        );
      }
      fs.writeFileSync(
        file,
        `import UIKit\n${source.replace(
          EXTENSION_POINT,
          `${EXTENSION_POINT}

  @available(iOS 26.0, *)
  @objc(preferredWindowingControlStyleForScene:)
  func preferredWindowingControlStyle(for windowScene: UIWindowScene) -> UIWindowScene.WindowingControlStyle {
    .minimal
  }`,
        )}`,
      );
      return config;
    },
  ]);
}

module.exports = withMinimalWindowControls;
