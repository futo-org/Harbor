import { defaultModeration, migrateSettings } from './index';

describe('defaultModeration', () => {
  it('shows every label outside the app stores', () => {
    expect(defaultModeration(false)).toEqual({
      hate: 'show',
      'self-harm': 'show',
      'sexually-suggestive': 'show',
      'sexually-explicit': 'show',
      violence: 'show',
    });
  });

  it('follows the app store policy on store builds', () => {
    expect(defaultModeration(true)).toEqual({
      hate: 'hide',
      'self-harm': 'hide',
      'sexually-suggestive': 'warn',
      'sexually-explicit': 'hide',
      violence: 'hide',
    });
  });
});

describe('migrateSettings', () => {
  const persisted = {
    theme: 'dark',
    linkPreviewsEnabled: false,
    moderation: { hate: 'show', 'sexually-suggestive': 'hide' },
  };

  it('applies the store policy once to store installs', () => {
    expect(migrateSettings(persisted, 0, true)).toEqual({
      ...persisted,
      moderation: {
        hate: 'hide',
        'self-harm': 'hide',
        'sexually-suggestive': 'warn',
        'sexually-explicit': 'hide',
        violence: 'hide',
      },
    });
  });

  it('leaves other installs alone', () => {
    expect(migrateSettings(persisted, 0, false)).toBe(persisted);
  });
});
