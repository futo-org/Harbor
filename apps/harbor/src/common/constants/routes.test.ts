import { safeReturnTo } from './routes';

describe('safeReturnTo', () => {
  it('accepts in-app absolute paths', () => {
    expect(safeReturnTo('/user123/post/9')).toBe('/user123/post/9');
    expect(safeReturnTo('/explore')).toBe('/explore');
  });

  it('rejects "/", which the onboarding welcome screen also serves', () => {
    expect(safeReturnTo('/')).toBeNull();
  });

  it('rejects other origins', () => {
    expect(safeReturnTo('https://evil.example')).toBeNull();
    // Protocol-relative URLs also leave the site.
    expect(safeReturnTo('//evil.example')).toBeNull();
  });

  it('rejects relative paths and non-strings', () => {
    expect(safeReturnTo('feed')).toBeNull();
    expect(safeReturnTo(undefined)).toBeNull();
    expect(safeReturnTo(['/a', '/b'])).toBeNull();
  });
});
