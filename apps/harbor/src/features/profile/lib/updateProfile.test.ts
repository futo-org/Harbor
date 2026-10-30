// Avoid the native barrel; updateProfile only needs COLLECTION and
// v2.ImageSet at runtime. The image helper is mocked so no encoding runs.
jest.mock('@polycentric/react-native', () => ({
  COLLECTION: { PROFILE: 3 },
  v2: { ImageSet: { create: (x: unknown) => x } },
}));
jest.mock('@/src/common/lib/images/processAndUploadImage', () => ({
  encodeImageVariants: jest.fn(),
}));

import { updateProfile } from './updateProfile';

type BuildArg = {
  oneofKind: 'profileUpdate';
  profileUpdate: {
    name: string;
    description: string;
    alias?: string;
    avatar?: unknown;
    banner?: unknown;
  };
};

function makeClient() {
  const build = jest.fn((content: BuildArg) => content);
  const client = {
    contentManager: { build, save: jest.fn(async () => {}) },
    buildEvent: jest.fn(async () => ({})),
    signEvent: jest.fn(async () => ({})),
    commitEvent: jest.fn(async () => {}),
    sync: jest.fn(async () => {}),
    fileStore: { put: jest.fn(async () => {}) },
  };
  // The built ProfileUpdate passed to contentManager.build.
  const builtProfile = () => build.mock.calls[0][0].profileUpdate;
  return { client, builtProfile };
}

describe('updateProfile', () => {
  it('writes a non-blank alias into the profile update', async () => {
    const { client, builtProfile } = makeClient();
    await updateProfile(client as never, {
      name: 'A',
      description: '',
      alias: 'user@domain.com',
    });
    expect(builtProfile().alias).toBe('user@domain.com');
  });

  it('trims surrounding whitespace from the alias', async () => {
    const { client, builtProfile } = makeClient();
    await updateProfile(client as never, {
      name: 'A',
      description: '',
      alias: '  user@domain.com  ',
    });
    expect(builtProfile().alias).toBe('user@domain.com');
  });

  it('omits a whitespace-only alias (stored as undefined, not "")', async () => {
    const { client, builtProfile } = makeClient();
    await updateProfile(client as never, {
      name: 'A',
      description: '',
      alias: '   ',
    });
    expect(builtProfile().alias).toBeUndefined();
  });

  it('omits the alias when none is provided', async () => {
    const { client, builtProfile } = makeClient();
    await updateProfile(client as never, { name: 'A', description: '' });
    expect(builtProfile().alias).toBeUndefined();
  });

  it('carries the existing avatar and banner forward when no new image is picked', async () => {
    const { client, builtProfile } = makeClient();
    const avatar = { variants: [{ width: 1 }] };
    const banner = { variants: [{ width: 2 }] };
    await updateProfile(client as never, {
      name: 'A',
      description: 'new bio',
      avatar: avatar as never,
      banner: banner as never,
    });
    expect(builtProfile().avatar).toBe(avatar);
    expect(builtProfile().banner).toBe(banner);
  });

  it('persists a newly picked avatar instead of the existing one', async () => {
    const { encodeImageVariants } = jest.requireMock(
      '@/src/common/lib/images/processAndUploadImage',
    );
    const variants = [
      { meta: { width: 3 }, digest: 'd1', bytes: new Uint8Array([1]) },
      { meta: { width: 4 }, digest: 'd2', bytes: new Uint8Array([2]) },
    ];
    encodeImageVariants.mockResolvedValueOnce(variants);
    const { client, builtProfile } = makeClient();
    await updateProfile(client as never, {
      name: 'A',
      description: '',
      avatarUri: 'file://new.png',
      avatar: { variants: [{ width: 1 }] } as never,
    });
    expect(builtProfile().avatar).toEqual({
      images: variants.map((v) => v.meta),
    });
    expect(client.fileStore.put).toHaveBeenCalledTimes(2);
    expect(client.fileStore.put).toHaveBeenCalledWith('d1', variants[0].bytes);
    expect(client.fileStore.put).toHaveBeenCalledWith('d2', variants[1].bytes);
  });

  it('commits without syncing', async () => {
    const { client } = makeClient();
    await updateProfile(client as never, {
      name: 'A',
      description: '',
      alias: 'user@domain.com',
    });
    expect(client.contentManager.save).toHaveBeenCalledTimes(1);
    expect(client.commitEvent).toHaveBeenCalledTimes(1);
    expect(client.sync).not.toHaveBeenCalled();
  });
});
