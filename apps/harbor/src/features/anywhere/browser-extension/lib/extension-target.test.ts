import { Routes } from '@/src/common/constants/routes';
import { extensionTarget } from './extension-target';

jest.mock('expo-router', () => ({ router: {} }));
jest.mock('@/src/common/lib/authGate', () => ({ withIdentity: jest.fn() }));

describe('extensionTarget', () => {
  it('is the page in the tab', () => {
    expect(
      extensionTarget('https://example.com/a', 'Example', undefined),
    ).toEqual({ kind: 'page', url: 'https://example.com/a', title: 'Example' });
  });

  it('is nothing for a browser page', () => {
    expect(extensionTarget('chrome://newtab/', 'New Tab', undefined)).toBe(
      undefined,
    );
  });

  it('is the page a Harbor page lists the posts about', () => {
    const sitePath = Routes.tabs.anywhere.url('https://example.com/a?b=1');
    expect(
      extensionTarget(`https://harbor.social${sitePath}`, 'Harbor', sitePath),
    ).toEqual({ kind: 'page', url: 'https://example.com/a?b=1' });
  });

  it('is the post a Harbor post page shows', () => {
    const sitePath = Routes.tabs.post('abc', 'f00d', '5');
    const post = {
      kind: 'post',
      identityId: 'abc',
      keyFingerprint: 'f00d',
      sequence: '5',
    };
    expect(extensionTarget('https://harbor.social/x', '', sitePath)).toEqual(
      post,
    );
    expect(
      extensionTarget('https://harbor.social/x', '', `${sitePath}/image/1`),
    ).toEqual(post);
  });

  it('is the Harbor page itself anywhere else on the site', () => {
    expect(
      extensionTarget('https://harbor.social/explore', 'Explore', '/explore'),
    ).toEqual({
      kind: 'page',
      url: 'https://harbor.social/explore',
      title: 'Explore',
    });
  });
});
