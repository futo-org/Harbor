import {
  decodeAnywhereSegment,
  encodeAnywhereUrl,
  anywhereUrlFromSegments,
  parseAnywhereUrl,
} from './anywhere-url';

/** As a path holding it is read back. */
function roundTrip(url: string) {
  const [domain, ...path] = encodeAnywhereUrl(url).split('/');
  return anywhereUrlFromSegments(
    decodeAnywhereSegment(domain),
    path.map((segment) => decodeAnywhereSegment(segment) ?? ''),
  );
}

describe('parseAnywhereUrl', () => {
  it('takes an address as an address bar would', () => {
    expect(parseAnywhereUrl(' example.com/a?b=1 ')).toBe(
      'https://example.com/a?b=1',
    );
    expect(parseAnywhereUrl('example.com')).toBe('https://example.com/');
    expect(parseAnywhereUrl('http://localhost:8081/x')).toBe(
      'http://localhost:8081/x',
    );
  });

  it('drops the fragment', () => {
    expect(parseAnywhereUrl('example.com/post#comments')).toBe(
      'https://example.com/post',
    );
  });

  it('is nothing for what is not an address', () => {
    for (const text of ['', 'harbor', 'two words', 'javascript:alert(1)']) {
      expect(parseAnywhereUrl(text)).toBeUndefined();
    }
  });
});

describe('page URL paths', () => {
  it('is the domain, then the rest as one safe segment', () => {
    expect(encodeAnywhereUrl('https://github.com/search?q=a+b&type=x')).toBe(
      'github.com/search%3Fq%3Da%2Bb%26type%3Dx',
    );
    expect(encodeAnywhereUrl('https://example.com/a/b/c.html')).toBe(
      'example.com/a/b/c.html',
    );
    expect(encodeAnywhereUrl('https://example.com/a/b/')).toBe(
      'example.com/a/b/%20',
    );
    expect(encodeAnywhereUrl('https://example.com/a//b')).toBe(
      'example.com/a/%20/b',
    );
    expect(encodeAnywhereUrl('https://github.com/')).toBe('github.com');
  });

  it('round-trips a query, fragment, escapes and non-ASCII text', () => {
    for (const url of [
      'https://example.com/a%20b/c?q=harbor+café&x=%2F1#top',
      'https://example.com/',
      'https://example.com/a/b/',
      'https://example.com/a//b',
      'https://example.com/?next=https://example.org/x',
      'http://localhost:8081/explore',
    ]) {
      expect(roundTrip(url)).toBe(url);
    }
  });
});
