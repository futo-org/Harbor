import type { ClaimField, Platform } from '../models.js';
import { Result } from '../result.js';
import {
  TextVerifier,
  type TextVerifierGetClaimFieldsTestData,
  type TextVerifierVerificationTestData,
} from '../verifier.js';
import { createCookieEnabledAxios } from '../utility.js';

class GithubTextVerifier extends TextVerifier {
  protected testDataVerification: TextVerifierVerificationTestData[] = [
    {
      expectedText: `The Osotnoc Corporation is a multinational business with its headquarters in Waitangi. The company is a manufacturing, sales, and support organization`,
      claimFields: <ClaimField[]>[{ key: 0, value: 'osotnoc-corp' }],
    },
  ];
  protected testDataGetClaimFields: TextVerifierGetClaimFieldsTestData[] = [
    {
      url: 'https://github.com/futo-org',
      expectedClaimFields: [{ key: 0, value: 'futo-org' }],
    },
  ];

  constructor() {
    super('GitHub');
  }

  protected async getText(claimField: ClaimField): Promise<Result<string>> {
    if (claimField.key !== 0) {
      const msg = `Invalid claim field type ${claimField.key}.`;
      return Result.err({ message: msg, extendedMessage: msg });
    }

    const client = createCookieEnabledAxios();
    const profileResult = await client({
      url: `https://api.github.com/users/${claimField.value}`,
    });
    if (profileResult.status !== 200) {
      return Result.err({
        message: 'Unable to find your account',
        extendedMessage: `Failed to get Profile page (${
          profileResult.status
        }): '${profileResult.statusText} (${profileResult.toString()})'.`,
      });
    }

    return Result.ok(profileResult.data.bio.trim());
  }

  public async getClaimFieldsByUrl(url: string): Promise<Result<ClaimField[]>> {
    const match = /https:\/\/(?:www\.)?github\.com\/([^/]+)\/?/.exec(url);
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

export const Github: Platform = {
  name: 'GitHub',
  verifiers: [new GithubTextVerifier()],
  version: 1,
};
