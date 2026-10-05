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

const CLAIM_BUNDLE = { claim: {} };

// Profile fields and the account the known-as claim proves; set per test.
let mockProfile: {
  knownAsClaimBundle: object | null;
  alias: string | null;
  isLoading?: boolean;
};
let mockVerifiedAccount: VerifiedPlatformAccount | null;
let mockVerifierBots: Set<string> | undefined;
let mockCurrentIdentity: string | null;

jest.mock('./hooks/useProfile', () => ({
  useProfile: () => mockProfile,
}));
jest.mock('../verifications/hooks/useVerifierIdentities', () => ({
  useVerifierIdentities: () => mockVerifierBots,
}));
jest.mock('../verifications/utils/claim-status', () => ({
  decodeVerificationClaimBundle: () => ({}),
}));
jest.mock('../verifications/hooks/useVerifiedPlatformAccounts', () => ({
  findVerifiedPlatformAccount: () => mockVerifiedAccount,
  findPlatformAccount: () => GITHUB_ACCOUNT,
}));
jest.mock('../verifications/hooks/useClaimById', () => ({
  decodeClaimBundle: () => ({}),
}));
jest.mock('@/src/common/lib/polycentric-hooks', () => ({
  shortenIdentityId: (id: string) => `short-${id}`,
  useCurrentIdentity: () => ({
    isCurrentIdentity: (identity: string) => identity === mockCurrentIdentity,
  }),
}));

import { IdentityHandle } from './IdentityHandle';

const renderIdentityHandle = () =>
  render(
    <ThemeProvider>
      <IdentityHandle identity={IDENTITY} />
    </ThemeProvider>,
  );

beforeEach(() => {
  mockVerifiedAccount = GITHUB_ACCOUNT;
  mockVerifierBots = new Set(['verifier-bot']);
  mockCurrentIdentity = null;
});

describe('IdentityHandle', () => {
  it('shows the known-as account over the alias', async () => {
    mockProfile = {
      knownAsClaimBundle: CLAIM_BUNDLE,
      alias: 'alice@example.com',
    };
    const { getByText, queryByText } = await renderIdentityHandle();
    expect(getByText('alice-gh')).toBeTruthy();
    expect(queryByText('alice@example.com')).toBeNull();
  });

  it('shows your own known-as without a verify, before the bot list loads', async () => {
    mockProfile = {
      knownAsClaimBundle: CLAIM_BUNDLE,
      alias: 'alice@example.com',
    };
    mockCurrentIdentity = IDENTITY;
    mockVerifiedAccount = null;
    mockVerifierBots = undefined;
    const { getByText } = await renderIdentityHandle();
    expect(getByText('alice-gh')).toBeTruthy();
  });

  it('hides the short id while the profile loads', async () => {
    mockProfile = { knownAsClaimBundle: null, alias: null, isLoading: true };
    const { queryByText } = await renderIdentityHandle();
    expect(queryByText(`short-${IDENTITY}`)).toBeNull();
  });

  it('shows the alias when known-as is not set', async () => {
    mockProfile = { knownAsClaimBundle: null, alias: 'alice@example.com' };
    const { getByText } = await renderIdentityHandle();
    expect(getByText('alice@example.com')).toBeTruthy();
  });

  it('shows the alias when the known-as claim is no longer verified', async () => {
    mockProfile = {
      knownAsClaimBundle: CLAIM_BUNDLE,
      alias: 'alice@example.com',
    };
    mockVerifiedAccount = null;
    const { getByText } = await renderIdentityHandle();
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
    const { getByText, queryByText } = await renderIdentityHandle();
    expect(getByText('alice@example.com')).toBeTruthy();
    expect(queryByText('alice-gh')).toBeNull();
  });

  it('shows the short id without known-as or alias', async () => {
    mockProfile = { knownAsClaimBundle: null, alias: null };
    const { getByText } = await renderIdentityHandle();
    expect(getByText(`short-${IDENTITY}`)).toBeTruthy();
  });
});
