// The image helper is mocked so no encoding runs.
jest.mock('@polycentric/react-native', () =>
  jest.requireActual('@/test/polycentric'),
);
jest.mock('@/src/common/lib/images/processAndUploadImage', () => ({
  encodeImageVariants: jest.fn(),
}));

import { COLLECTION, type v2 } from '@polycentric/react-native';
import { contentAs } from '@/src/common/lib/polycentric-hooks/helpers';
import { updateProfile } from './updateProfile';

function makeClient() {
  const client = {
    publish: jest.fn(async (_content: v2.Content, _collection: number) => ({})),
    commitBlob: jest.fn(async () => ({})),
    sync: jest.fn(async () => 0),
  };
  // The ProfileUpdate passed to `publish`.
  const builtProfile = () => {
    const update = contentAs(client.publish.mock.calls[0][0], 'profileUpdate');
    if (!update) throw new Error('not a profile update');
    return update;
  };
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
      {
        meta: { width: 3 },
        blob: { mimeType: 'image/jpeg' },
        bytes: new Uint8Array([1]),
      },
      {
        meta: { width: 4 },
        blob: { mimeType: 'image/jpeg' },
        bytes: new Uint8Array([2]),
      },
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
    expect(client.commitBlob).toHaveBeenCalledTimes(2);
    expect(client.commitBlob).toHaveBeenCalledWith(
      variants[0].bytes,
      'image/jpeg',
    );
    expect(client.commitBlob).toHaveBeenCalledWith(
      variants[1].bytes,
      'image/jpeg',
    );
  });

  it('commits without syncing', async () => {
    const { client } = makeClient();
    await updateProfile(client as never, {
      name: 'A',
      description: '',
      alias: 'user@domain.com',
    });
    expect(client.publish).toHaveBeenCalledTimes(1);
    expect(client.publish.mock.calls[0][1]).toBe(COLLECTION.PROFILE);
    expect(client.sync).not.toHaveBeenCalled();
  });
});
