const { AndroidConfig, withAndroidStyles } = require('expo/config-plugins');

// Some devices (OEM "dark mode for apps", the "Override force-dark" dev
// option) auto-darken light views; the app handles dark mode itself.
function withDisableForceDark(config) {
  return withAndroidStyles(config, (config) => {
    config.modResults = AndroidConfig.Styles.assignStylesValue(
      config.modResults,
      {
        add: true,
        parent: AndroidConfig.Styles.getAppThemeGroup(),
        name: 'android:forceDarkAllowed',
        value: 'false',
      },
    );
    return config;
  });
}

module.exports = withDisableForceDark;
