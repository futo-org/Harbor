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

const CLAIM_BUNDLE = {};

// Profile fields and the account the known-as claim proves; set per test.
let mockProfile: { knownAsClaimBundle: object | null; alias: string | null };
let mockVerifiedAccount: VerifiedPlatformAccount | null;

jest.mock('./hooks/useProfile', () => ({
  useProfile: () => mockProfile,
}));
jest.mock('../verifications/hooks/useVerifierIdentities', () => ({
  useVerifierIdentities: () => new Set(['verifier-bot']),
}));
jest.mock('../verifications/utils/claim-status', () => ({
  decodeVerificationClaimBundle: () => ({}),
}));
jest.mock('../verifications/hooks/useVerifiedPlatformAccounts', () => ({
  findVerifiedPlatformAccount: () => mockVerifiedAccount,
}));
jest.mock('@/src/common/lib/polycentric-hooks', () => ({
  shortenIdentityId: (id: string) => `short-${id}`,
}));

import { IdentityHandle } from './IdentityHandle';

const renderTag = () =>
  render(
    <ThemeProvider>
      <IdentityHandle identity={IDENTITY} />
    </ThemeProvider>,
  );

beforeEach(() => {
  mockVerifiedAccount = GITHUB_ACCOUNT;
});

describe('IdentityHandle', () => {
  it('shows the known-as account over the alias', async () => {
    mockProfile = {
      knownAsClaimBundle: CLAIM_BUNDLE,
      alias: 'alice@example.com',
    };
    const { getByText, queryByText } = await renderTag();
    expect(getByText('alice-gh')).toBeTruthy();
    expect(queryByText('alice@example.com')).toBeNull();
  });

  it('shows the alias when known-as is not set', async () => {
    mockProfile = { knownAsClaimBundle: null, alias: 'alice@example.com' };
    const { getByText } = await renderTag();
    expect(getByText('alice@example.com')).toBeTruthy();
  });

  it('shows the alias when the known-as claim is no longer verified', async () => {
    mockProfile = {
      knownAsClaimBundle: CLAIM_BUNDLE,
      alias: 'alice@example.com',
    };
    mockVerifiedAccount = null;
    const { getByText } = await renderTag();
    expect(getByText('alice@example.com')).toBeTruthy();
  });

  it('shows the alias when the known-as claim is for the Other platform', async () => {
    mockProfile = {
      knownAsClaimBundle: CLAIM_BUNDLE,
      alias: 'alice@example.com',
    };
    mockVerifiedAccount = {
      ...GITHUB_ACCOUNT,
      platform: { ...GITHUB_ACCOUNT.platform, generic: true },
    };
    const { getByText, queryByText } = await renderTag();
    expect(getByText('alice@example.com')).toBeTruthy();
    expect(queryByText('alice-gh')).toBeNull();
  });

  it('shows the short id without known-as or alias', async () => {
    mockProfile = { knownAsClaimBundle: null, alias: null };
    const { getByText } = await renderTag();
    expect(getByText(`short-${IDENTITY}`)).toBeTruthy();
  });
});
