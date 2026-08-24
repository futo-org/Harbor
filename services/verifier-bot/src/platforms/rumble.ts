import type { ClaimField, Platform } from '../models.js';
import { Result } from '../result.js';
import parse from 'node-html-parser';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import type { Browser } from 'puppeteer-extra-plugin/dist/puppeteer';
import {
  TextVerifier,
  type TextVerifierGetClaimFieldsTestData,
  type TextVerifierVerificationTestData,
} from '../verifier.js';

// Rumble answers plain HTTP requests from our hosts with 403.
puppeteer.use(StealthPlugin());

// Only channel pages have a description, so only they can be verified.
const USE_A_CHANNEL_URL =
  'Rumble user pages no longer show a description. Put the token in your channel description and claim your channel URL (rumble.com/c/...).';

class RumbleTextVerifier extends TextVerifier {
  private puppeteerBrowser?: Browser;

  protected testDataVerification: TextVerifierVerificationTestData[] = [
    {
      expectedText: '8YTgkgK6jTImETJdUa+kd7HURgZrhKjLVDL6yp5ETik=',
      claimFields: <ClaimField[]>[{ key: 1, value: 'c-3366838' }],
    },
  ];
  protected testDataGetClaimFields: TextVerifierGetClaimFieldsTestData[] = [
    {
      url: 'https://rumble.com/c/c-213123',
      expectedClaimFields: [{ key: 1, value: 'c-213123' }],
    },
  ];

  constructor() {
    super('Rumble');
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
    switch (claimField.key) {
      // Claimed before user pages dropped their description. Kept so the
      // failure explains itself rather than reading as a broken verifier.
      case 0:
        return Result.err({
          message: USE_A_CHANNEL_URL,
          extendedMessage: `Rumble user pages carry no description (user '${claimField.value}').`,
        });
      case 1:
        return this.getDescription(
          `https://rumble.com/c/${claimField.value}/about`,
        );
      default: {
        const msg = `Invalid claim field type ${claimField.key}.`;
        return Result.err({ message: msg, extendedMessage: msg });
      }
    }
  }

  /** The About page's description, which is where the pairing token goes. */
  private async getDescription(url: string): Promise<Result<string>> {
    if (this.puppeteerBrowser === undefined) {
      return Result.errMsg('Puppeteer not setup');
    }

    const page = await this.puppeteerBrowser.newPage();
    let html: string;
    try {
      const response = await page.goto(url);
      const status = response?.status();
      if (status !== 200) {
        return Result.err({
          message: 'Unable to find your account',
          extendedMessage: `Failed to get Profile page (${status}): '${url}'.`,
        });
      }
      html = await page.content();
    } finally {
      await page.close();
    }

    const node = parse(html).querySelector('.channel-about--description');
    if (!node) {
      return Result.err({
        message: 'No description found on your channel page.',
        extendedMessage: `Failed to find node '.channel-about--description' on ${url}`,
      });
    }

    return Result.ok(node.structuredText.trim());
  }

  public async getClaimFieldsByUrl(url: string): Promise<Result<ClaimField[]>> {
    const channelMatch = /https:\/\/(?:www\.)?rumble\.com\/c\/([^/]+)\/?/.exec(
      url,
    );
    if (channelMatch) {
      return Result.ok([
        {
          key: 1,
          value: channelMatch[1],
        },
      ]);
    }

    if (/https:\/\/(?:www\.)?rumble\.com\/user\//.test(url)) {
      return Result.err({ message: USE_A_CHANNEL_URL });
    }

    return Result.err({ message: 'Failed to match a channel.' });
  }
}

export const Rumble: Platform = {
  name: 'Rumble',
  verifiers: [new RumbleTextVerifier()],
  version: 1,
};
