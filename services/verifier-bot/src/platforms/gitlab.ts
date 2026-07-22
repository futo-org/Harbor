import type { ClaimField, Platform } from '../models.js';
import { Result } from '../result.js';
import { createCookieEnabledAxios } from '../utility.js';
import {
  TextVerifier,
  type TextVerifierGetClaimFieldsTestData,
  type TextVerifierVerificationTestData,
} from '../verifier.js';

class GitlabTextVerifier extends TextVerifier {
  protected testDataVerification: TextVerifierVerificationTestData[] = [
    {
      expectedText: 'biobiobio',
      claimFields: <ClaimField[]>[{ key: 0, value: 'tazzz' }],
    },
  ];
  protected testDataGetClaimFields: TextVerifierGetClaimFieldsTestData[] = [
    {
      url: 'https://gitlab.com/futo',
      expectedClaimFields: [{ key: 0, value: 'futo' }],
    },
  ];

  constructor() {
    super('GitLab');
  }

  protected async getText(claimField: ClaimField): Promise<Result<string>> {
    if (claimField.key !== 0) {
      const msg = `Invalid claim field type ${claimField.key}.`;
      return Result.err({ message: msg, extendedMessage: msg });
    }

    const client = createCookieEnabledAxios();
    const profileResult = await client({
      url: `https://gitlab.com/${claimField.value}`,
    });
    if (profileResult.status !== 200) {
      return Result.err({
        message: 'Unable to find your account',
        extendedMessage: `Failed to get Profile page (${
          profileResult.status
        }): '${profileResult.statusText} (${profileResult.toString()})'.`,
      });
    }

    const match = /<meta content="([^"]+)" property="og:description">/.exec(
      profileResult.data,
    );
    if (!match) {
      return Result.err({
        message:
          'Verifier encountered an error attempting to check your profile description',
        extendedMessage: 'Failed to find description meta tag.',
      });
    }

    return Result.ok(match[1]);
  }

  public async getClaimFieldsByUrl(url: string): Promise<Result<ClaimField[]>> {
    const match = /https:\/\/(?:www\.)?gitlab\.com\/([^/]+)\/?/.exec(url);
    if (!match) {
      return Result.err({ message: 'Failed to match regex' });
    }

    return Result.ok([
      {
        key: 0,
        value: match[1],
      },
    ]);
  }
}

export const Gitlab: Platform = {
  name: 'GitLab',
  verifiers: [new GitlabTextVerifier()],
  version: 1,
};
