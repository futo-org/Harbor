import { toMetadata, unavailableHead } from './index';

describe('toMetadata', () => {
  it('titles the home page with the tagline', () => {
    const metadata = toMetadata({ title: null, description: 'd', path: '/' });

    expect(metadata.title).toBe('Harbor - Share to the world, not platforms.');
    expect(metadata.alternates?.canonical).toBe('https://harbor.social/');
    expect(metadata.twitter?.card).toBe('summary_large_image');
  });

  it('keeps unavailable content out of search results', () => {
    const metadata = toMetadata(unavailableHead('Post', '/x/post/y/1'));

    expect(metadata.title).toBe('Post / Harbor');
    expect(metadata.robots).toEqual({ index: false, follow: true });
  });
});
