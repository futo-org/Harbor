jest.mock('@polycentric/react-native', () => ({
  v2: jest.requireActual('../../../../../../packages/js-core/src/proto/v2'),
}));
jest.mock('@/src/common/query/hooks/useQuery', () => ({}));
jest.mock('@noble/hashes/sha2.js', () => ({
  sha256: (bytes: Uint8Array) => bytes,
}));

import { v2 } from '@polycentric/react-native';
import { postLinks } from './helpers';

const GRAYJAY = v2.Application.create({
  name: 'Grayjay',
  id: 'com.futo.platformplayer.playstore',
});
const VIDEO = 'https://www.youtube.com/watch?v=abc';

function post(links: Partial<v2.Link>[], attributedTo?: Partial<v2.Link>) {
  return v2.Post.create({
    links: links.map((link) => v2.Link.create(link)),
    attributedTo: attributedTo
      ? [{ to: { oneofKind: 'link', link: v2.Link.create(attributedTo) } }]
      : [],
  });
}

describe('postLinks', () => {
  it('leaves the posts of other applications as they are', () => {
    const { links, attributedLink } = postLinks(
      post([{ url: 'https://example.com' }], { url: VIDEO }),
    );
    expect(links.map((link) => link.url)).toEqual(['https://example.com']);
    expect(attributedLink?.url).toBe(VIDEO);
  });

  it('shows a Grayjay card as the page the post is about', () => {
    const { links, attributedLink } = postLinks(
      post([{ url: VIDEO, title: 'A video', image: 'https://img/1.jpg' }], {
        url: VIDEO,
        title: 'A video',
      }),
      GRAYJAY,
    );
    expect(links).toEqual([]);
    expect(attributedLink?.image).toBe('https://img/1.jpg');
  });

  it('takes the card of a Grayjay post attributed to nothing', () => {
    const { links, attributedLink } = postLinks(
      post([{ url: VIDEO, title: 'A video' }]),
      GRAYJAY,
    );
    expect(links).toEqual([]);
    expect(attributedLink?.url).toBe(VIDEO);
  });
});
