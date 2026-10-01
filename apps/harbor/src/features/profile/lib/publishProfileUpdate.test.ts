// Avoid the native barrel; publishProfileUpdate only needs COLLECTION and the
// protos at runtime. The image helper is mocked so no upload path runs.
jest.mock('@polycentric/react-native', () => ({
  COLLECTION: { PROFILE: 3 },
  v2: jest.requireActual('../../../../../../packages/js-core/src/proto/v2'),
}));
jest.mock('@/src/common/lib/images/processAndUploadImage', () => ({
  processAndUploadImage: jest.fn(),
}));

import { eventKeyId } from '@/src/common/lib/polycentric-hooks/helpers';
import { v2 } from '@polycentric/react-native';
import { publishProfileUpdate } from './publishProfileUpdate';

type BuildArg = {
  oneofKind: 'profileUpdate';
  profileUpdate: {
    name: string;
    description: string;
    alias?: string;
    knownAs?: v2.KnownAs;
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
  };
  // The built ProfileUpdate passed to contentManager.build.
  const builtProfile = () => build.mock.calls[0][0].profileUpdate;
  return { client, builtProfile };
}

describe('publishProfileUpdate', () => {
  it('writes a non-blank alias into the profile update', async () => {
    const { client, builtProfile } = makeClient();
    await publishProfileUpdate(client as never, {
      name: 'A',
      description: '',
      alias: 'user@domain.com',
    });
    expect(builtProfile().alias).toBe('user@domain.com');
  });

  it('trims surrounding whitespace from the alias', async () => {
    const { client, builtProfile } = makeClient();
    await publishProfileUpdate(client as never, {
      name: 'A',
      description: '',
      alias: '  user@domain.com  ',
    });
    expect(builtProfile().alias).toBe('user@domain.com');
  });

  it('omits a whitespace-only alias (stored as undefined, not "")', async () => {
    const { client, builtProfile } = makeClient();
    await publishProfileUpdate(client as never, {
      name: 'A',
      description: '',
      alias: '   ',
    });
    expect(builtProfile().alias).toBeUndefined();
  });

  it('omits the alias when none is provided', async () => {
    const { client, builtProfile } = makeClient();
    await publishProfileUpdate(client as never, { name: 'A', description: '' });
    expect(builtProfile().alias).toBeUndefined();
  });

  it('writes the known-as claim id as its event key', async () => {
    const claimKey = v2.EventKey.create({
      collection: 8,
      identity: 'me',
      signedBy: v2.PublicKey.create({ key: new Uint8Array([1, 2, 3]) }),
      sequence: 7n,
    });
    const { client, builtProfile } = makeClient();
    await publishProfileUpdate(client as never, {
      name: 'A',
      description: '',
      knownAs: { kind: 'platformAccount', claimId: eventKeyId(claimKey) },
    });
    expect(builtProfile().knownAs).toEqual({
      kind: {
        oneofKind: 'platformAccount',
        platformAccount: { claim: claimKey },
      },
    });
  });

  it('omits the known-as claim when none is provided', async () => {
    const { client, builtProfile } = makeClient();
    await publishProfileUpdate(client as never, { name: 'A', description: '' });
    expect(builtProfile().knownAs).toBeUndefined();
  });

  it('carries the existing avatar and banner forward when no new image is picked', async () => {
    const { client, builtProfile } = makeClient();
    const avatar = { variants: [{ width: 1 }] };
    const banner = { variants: [{ width: 2 }] };
    await publishProfileUpdate(client as never, {
      name: 'A',
      description: 'new bio',
      avatar: avatar as never,
      banner: banner as never,
    });
    expect(builtProfile().avatar).toBe(avatar);
    expect(builtProfile().banner).toBe(banner);
  });

  it('uploads a newly picked avatar instead of the existing one', async () => {
    const { processAndUploadImage } = jest.requireMock(
      '@/src/common/lib/images/processAndUploadImage',
    );
    const uploaded = { variants: [{ width: 3 }] };
    processAndUploadImage.mockResolvedValueOnce(uploaded);
    const { client, builtProfile } = makeClient();
    await publishProfileUpdate(client as never, {
      name: 'A',
      description: '',
      avatarUri: 'file://new.png',
      avatar: { variants: [{ width: 1 }] } as never,
    });
    expect(builtProfile().avatar).toBe(uploaded);
  });

  it('commits and syncs the built content', async () => {
    const { client } = makeClient();
    await publishProfileUpdate(client as never, {
      name: 'A',
      description: '',
      alias: 'user@domain.com',
    });
    expect(client.contentManager.save).toHaveBeenCalledTimes(1);
    expect(client.commitEvent).toHaveBeenCalledTimes(1);
    expect(client.sync).toHaveBeenCalledTimes(1);
  });
});
