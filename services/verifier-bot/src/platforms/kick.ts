import parse from 'node-html-parser';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import type { Browser } from 'puppeteer-extra-plugin/dist/puppeteer';

// Kick's bot protection blocks vanilla headless Chrome outright.
puppeteer.use(StealthPlugin());
import type { ClaimField, Platform } from '../models.js';
import { Result } from '../result.js';
import {
  TextVerifier,
  type TextVerifierGetClaimFieldsTestData,
  type TextVerifierVerificationTestData,
} from '../verifier.js';

class KickTextVerifier extends TextVerifier {
  private puppeteerBrowser?: Browser;

  protected testDataVerification: TextVerifierVerificationTestData[] = [
    {
      expectedText: `The Osotnoc Corporation is a multinational business with its headquarters in Waitangi. The company is a manufacturing, sales, and support organization`,
      claimFields: <ClaimField[]>[{ key: 0, value: 'osotnoc' }],
    },
  ];
  protected testDataGetClaimFields: TextVerifierGetClaimFieldsTestData[] = [
    {
      url: 'https://kick.com/futo',
      expectedClaimFields: [{ key: 0, value: 'futo' }],
    },
  ];

  constructor() {
    super('Kick');
  }

  public async init(): Promise<void> {
    super.init();
    this.puppeteerBrowser = await puppeteer.launch({
      headless: true,
      executablePath:
        process.env.POLYCENTRIC_VERIFIER_BOT_PUPPETEER_EXECUTABLE_PATH,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  }

  public async dispose(): Promise<void> {
    super.dispose();

    if (this.puppeteerBrowser !== undefined) {
      this.puppeteerBrowser.close();
    }
  }

  protected async getText(claimField: ClaimField): Promise<Result<string>> {
    if (this.puppeteerBrowser === undefined) {
      return Result.errMsg('Puppeteer not setup');
    }

    if (claimField.key !== 0) {
      const msg = `Invalid claim field type ${claimField.key}.`;
      return Result.err({ message: msg, extendedMessage: msg });
    }

    const page = await this.puppeteerBrowser.newPage();
    await page.goto(`https://kick.com/api/v2/channels/${claimField.value}`);
    const pageData = await page.content();
    const body = parse(pageData).getElementsByTagName('body');
    if (!body || body.length === 0) {
      return Result.err({
        message:
          'The verifier encountered unknown error occurred verifying your Kick account',
        extendedMessage: `Unable to extract body from HTML returned from puppeteer. HTML returned: ${pageData}`,
      });
    }

    const content = body[0].textContent;
    let data: { user?: { bio?: string } };
    try {
      data = JSON.parse(content);
    } catch {
      data = {};
    }
    if (typeof data.user?.bio !== 'string') {
      return Result.err({
        message:
          'The verifier encountered unknown error occurred verifying your Kick account',
        extendedMessage: `Unexpected response from Kick API: ${content}`,
      });
    }
    return Result.ok(data.user.bio);
  }

  public async getClaimFieldsByUrl(url: string): Promise<Result<ClaimField[]>> {
    const match = /https:\/\/(?:www\.)?kick\.com\/([^/]+)\/?/.exec(url);
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

export const Kick: Platform = {
  name: 'Kick',
  verifiers: [new KickTextVerifier()],
  version: 1,
};
