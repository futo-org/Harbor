import { joinSharedText } from './joinSharedText';

describe('joinSharedText', () => {
  it('puts the URL on its own line after the text', () => {
    expect(joinSharedText(['Look at this'], ['https://example.com'])).toBe(
      'Look at this\nhttps://example.com',
    );
  });

  it('leaves out a URL the text already contains', () => {
    expect(
      joinSharedText(
        ['Look at https://example.com today'],
        ['https://example.com'],
      ),
    ).toBe('Look at https://example.com today');
  });

  it('leaves out a URL that any of the texts contains', () => {
    expect(
      joinSharedText(
        ['Title', 'https://example.com/a'],
        ['https://example.com/a', 'https://example.com/b'],
      ),
    ).toBe('Title\nhttps://example.com/a\nhttps://example.com/b');
  });

  it('returns the text alone when there is no URL', () => {
    expect(joinSharedText(['Just text'], [])).toBe('Just text');
  });

  it('returns the URL alone when the text is empty', () => {
    expect(joinSharedText([''], ['https://example.com'])).toBe(
      'https://example.com',
    );
  });

  it('trims the texts and drops blank ones', () => {
    expect(
      joinSharedText(['  Title \n', ' \n '], ['https://example.com']),
    ).toBe('Title\nhttps://example.com');
  });

  it('returns an empty string when nothing was shared', () => {
    expect(joinSharedText([], [])).toBe('');
  });
});
