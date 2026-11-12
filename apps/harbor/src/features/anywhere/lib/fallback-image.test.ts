import { fallbackImage } from './fallback-image';

describe('fallbackImage', () => {
  const fetchMock = jest.fn();
  const realFetch = global.fetch;

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
  });

  afterAll(() => {
    global.fetch = realFetch;
  });

  it('finds the video in each kind of YouTube address', async () => {
    for (const url of [
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10',
      'https://m.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://youtu.be/dQw4w9WgXcQ?si=abc',
      'https://youtube.com/shorts/dQw4w9WgXcQ',
    ]) {
      expect(await fallbackImage(url)).toBe(
        'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
      );
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('asks Rumble for the thumbnail of its videos', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ thumbnail_url: 'https://cdn.example/thumb.jpg' }),
    });
    expect(await fallbackImage('https://rumble.com/v1abcd-a-video.html')).toBe(
      'https://cdn.example/thumb.jpg',
    );
    expect(fetchMock).toHaveBeenCalledWith(
      'https://rumble.com/api/Media/oembed.json?url=https%3A%2F%2Frumble.com%2Fv1abcd-a-video.html',
    );
  });

  it('is nothing when Rumble does not answer', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    expect(
      await fallbackImage('https://rumble.com/v1abcd-a-video.html'),
    ).toBeUndefined();
  });

  it('is nothing for other addresses', async () => {
    expect(
      await fallbackImage('https://example.com/watch?v=abc'),
    ).toBeUndefined();
    expect(
      await fallbackImage('https://www.youtube.com/@channel'),
    ).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
