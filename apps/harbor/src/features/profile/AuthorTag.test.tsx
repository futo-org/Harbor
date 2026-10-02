import { ThemeProvider } from '@/src/common/theme';
import { render } from '@testing-library/react-native';
import type { VerifiedPlatformAccount } from '../verifications/hooks/useVerifiedPlatformAccounts';

const IDENTITY =
  'f00df0262908a197391c4cbc619eb11cb6867c90915b6e23a3db7a061def8fc3';

const GITHUB_ACCOUNT = {
  claimId: 'claim-1',
  platform: { logo: () => null, color: 'neutral_500' },
  account: 'alice-gh',
} as unknown as VerifiedPlatformAccount;

// Profile fields and verified accounts the tag reads; set per test.
let mockProfile: { knownAs: string | null; alias: string | null };
let mockVerifiedAccounts: VerifiedPlatformAccount[];

jest.mock('./hooks/useProfile', () => ({
  useProfile: () => mockProfile,
}));
jest.mock('../verifications/hooks/useVerifiedPlatformAccounts', () => ({
  useVerifiedPlatformAccounts: () => ({
    verifiedAccounts: mockVerifiedAccounts,
    isLoading: false,
  }),
}));
jest.mock('@polycentric/react-native', () => ({
  FetchMode: { OfflineFirst: 'offline-first' },
}));
jest.mock('@/src/common/lib/polycentric-hooks', () => ({
  shortenIdentityId: (id: string) => `short-${id}`,
}));

import { AuthorTag } from './AuthorTag';

const renderTag = () =>
  render(
    <ThemeProvider>
      <AuthorTag identity={IDENTITY} />
    </ThemeProvider>,
  );

beforeEach(() => {
  mockVerifiedAccounts = [GITHUB_ACCOUNT];
});

describe('AuthorTag', () => {
  it('shows the known-as account over the alias', async () => {
    mockProfile = { knownAs: 'claim-1', alias: 'alice@example.com' };
    const { getByText, queryByText } = await renderTag();
    expect(getByText('alice-gh')).toBeTruthy();
    expect(queryByText('alice@example.com')).toBeNull();
  });

  it('shows the alias when known-as is not set', async () => {
    mockProfile = { knownAs: null, alias: 'alice@example.com' };
    const { getByText } = await renderTag();
    expect(getByText('alice@example.com')).toBeTruthy();
  });

  it('shows the alias when the known-as claim is no longer verified', async () => {
    mockProfile = { knownAs: 'claim-1', alias: 'alice@example.com' };
    mockVerifiedAccounts = [];
    const { getByText } = await renderTag();
    expect(getByText('alice@example.com')).toBeTruthy();
  });

  it('shows the alias when the known-as claim is for the Other platform', async () => {
    mockProfile = { knownAs: 'claim-1', alias: 'alice@example.com' };
    mockVerifiedAccounts = [
      {
        ...GITHUB_ACCOUNT,
        platform: { ...GITHUB_ACCOUNT.platform, generic: true },
      },
    ];
    const { getByText, queryByText } = await renderTag();
    expect(getByText('alice@example.com')).toBeTruthy();
    expect(queryByText('alice-gh')).toBeNull();
  });

  it('shows the short id without known-as or alias', async () => {
    mockProfile = { knownAs: null, alias: null };
    const { getByText } = await renderTag();
    expect(getByText(`short-${IDENTITY}`)).toBeTruthy();
  });
});
