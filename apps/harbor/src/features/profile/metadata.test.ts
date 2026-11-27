import { toMetadata } from '@/src/common/lib/page-metadata/page';
import type { Author } from './lib/load-author';
import { profilePage } from './metadata';

// Reads from the server, through the SDK
jest.mock('./lib/load-author', () => ({ loadAuthor: jest.fn() }));

const author: Author = {
  identity: 'a'.repeat(64),
  name: 'Ada',
  handle: 'ada.example',
  path: '/ada.example',
  description: 'Maths,\n  mostly.',
  avatar: {
    url: 'https://srv.example/blob/1_ab',
    width: 512,
    height: 512,
    type: 'image/jpeg',
  },
  followersCount: 1,
  followingCount: 3,
  sensitive: false,
};

describe('profilePage', () => {
  it('describes a profile by its bio and follow counts', () => {
    const metadata = toMetadata(profilePage(author, {}));

    expect(metadata.title).toBe('Ada (ada.example) / Harbor');
    expect(metadata.description).toBe(
      'Maths, mostly. · 1 follower, 3 following',
    );
    expect(metadata.alternates?.canonical).toBe(
      'https://harbor.social/ada.example',
    );
    expect(metadata.twitter?.card).toBe('summary');
    expect(metadata.robots).toBeUndefined();
  });

  it('points a sub-screen at the profile', () => {
    const page = profilePage(author, { label: 'Followers', noindex: true });

    expect(page.title).toBe('Followers - Ada (ada.example)');
    expect(page.path).toBe('/ada.example');
    expect(page.noindex).toBe(true);
  });

  it('shows nothing of a profile with a moderation label', () => {
    const page = profilePage({ ...author, sensitive: true }, {});

    expect(page.image).toBeNull();
    expect(page.description).toBe('Ada is on Harbor. 1 follower, 3 following.');
    expect(page.noindex).toBe(true);
  });
});
