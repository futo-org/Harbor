const { AndroidConfig, withAndroidStyles } = require('expo/config-plugins');

// EmojiCompat (applied by AppCompat text views) replaces emoji missing from
// the system emoji font with Noto Color Emoji, even though we ship our own
// Twemoji font for this purpose. This disables it for text views. Inputs
// still rely on the system font, so they keep the default behavior.
function withDisableEmojiCompat(config) {
  return withAndroidStyles(config, (config) => {
    config.modResults = AndroidConfig.Styles.assignStylesValue(
      config.modResults,
      {
        add: true,
        parent: {
          name: 'TextViewWithoutEmojiCompat',
          parent: 'Widget.AppCompat.TextView',
        },
        name: 'emojiCompatEnabled',
        value: 'false',
      },
    );
    config.modResults = AndroidConfig.Styles.assignStylesValue(
      config.modResults,
      {
        add: true,
        parent: AndroidConfig.Styles.getAppThemeGroup(),
        name: 'android:textViewStyle',
        value: '@style/TextViewWithoutEmojiCompat',
      },
    );
    return config;
  });
}

module.exports = withDisableEmojiCompat;
