jest.mock('@/src/common/theme', () => ({}));

import { isProfileUrl } from './platforms';

describe('isProfileUrl', () => {
  it.each([
    'x.com/futo',
    'youtube.com',
    'https://example.com',
    'http://example.com/path',
    'news.ycombinator.com/user?id=futo',
    'sub.domain.co.uk/channel',
  ])('accepts %s', (value) => {
    expect(isProfileUrl(value)).toBe(true);
  });

  it.each([
    '',
    'example',
    'http://',
    'foo bar.com',
    '.com',
    'example.',
    'example.c',
  ])('rejects %s', (value) => {
    expect(isProfileUrl(value)).toBe(false);
  });

  it('ignores surrounding whitespace', () => {
    expect(isProfileUrl('  x.com/futo  ')).toBe(true);
  });
});
