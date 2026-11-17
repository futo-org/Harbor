import {
  parseFeatureFlagDefaults,
  resolveFeatureFlag,
} from './resolve-feature-flag';

describe('parseFeatureFlagDefaults', () => {
  it('reads the flags a build sets', () => {
    expect(parseFeatureFlagDefaults('anywhere=true')).toEqual({
      anywhere: true,
    });
    expect(parseFeatureFlagDefaults(' anywhere = false ')).toEqual({
      anywhere: false,
    });
  });

  it('leaves out what it cannot read', () => {
    expect(parseFeatureFlagDefaults(undefined)).toEqual({});
    expect(parseFeatureFlagDefaults('')).toEqual({});
    expect(parseFeatureFlagDefaults('anywhere')).toEqual({});
    expect(parseFeatureFlagDefaults('anywhere=yes,unreleased=true')).toEqual(
      {},
    );
  });
});

describe('resolveFeatureFlag', () => {
  it('is the default in the registry when nothing else says', () => {
    expect(resolveFeatureFlag('anywhere', {}, {})).toBe(false);
  });

  it('follows the build where the flag was never switched', () => {
    expect(resolveFeatureFlag('anywhere', {}, { anywhere: true })).toBe(true);
  });

  it('keeps a switch in settings over the build, either way', () => {
    expect(
      resolveFeatureFlag('anywhere', { anywhere: false }, { anywhere: true }),
    ).toBe(false);
    expect(
      resolveFeatureFlag('anywhere', { anywhere: true }, { anywhere: false }),
    ).toBe(true);
  });
});
