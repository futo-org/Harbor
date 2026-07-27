import { isNewerVersion } from './isNewerVersion';

describe('isNewerVersion', () => {
  it.each([
    ['v2.0.9', '0.0.1'],
    ['v2.1.0', '2.0.9'],
    ['v2.0.10', '2.0.9'],
    ['v2.0.0', '2.0.0-alpha.3'],
    ['v2.0.0-alpha.10', '2.0.0-alpha.3'],
  ])('orders %s after %s', (latest, current) => {
    expect(isNewerVersion(latest, current)).toBe(true);
  });

  it.each([
    ['2.0.9', 'v2.0.9'],
    ['v2.0.0-alpha.3', '2.0.0'],
    ['v2.0.0-alpha.2', '2.0.0-alpha.3'],
    ['v1.9.9', '2.0.0-alpha.3'],
    ['2.0', '2.0.0'],
    ['2.0.01', '2.0.1'],
    ['v2.0.0-alpha', '2.0.0'],
    ['v2.0.0-beta.1', '2.0.0'],
    ['not-a-version', '2.0.0'],
  ])('does not order %s after %s', (latest, current) => {
    expect(isNewerVersion(latest, current)).toBe(false);
  });
});
