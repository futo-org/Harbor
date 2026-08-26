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

class RumbleTextVerifier extends TextVerifier {
  private puppeteerBrowser?: Browser;

  protected testDataVerification: TextVerifierVerificationTestData[] = [
    {
      expectedText: '8YTgkgK6jTImETJdUa+kd7HURgZrhKjLVDL6yp5ETik=',
      claimFields: <ClaimField[]>[{ key: 1, value: 'c-3366838' }],
    },
    // User pages carry a description too, so the other claim type needs an
    // account that has one set.
    {
      expectedText: 'harbor.social/5640b24e53a3b1edb65360840aaf085373b23d4ff',
      claimFields: <ClaimField[]>[{ key: 0, value: 'mark_futo' }],
    },
  ];
  protected testDataGetClaimFields: TextVerifierGetClaimFieldsTestData[] = [
    {
      url: 'https://rumble.com/user/futo',
      expectedClaimFields: [{ key: 0, value: 'futo' }],
    },
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
      case 0:
        return this.getDescription(
          `https://rumble.com/user/${claimField.value}/about`,
        );
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
        message: 'No description found on your About page.',
        extendedMessage: `Failed to find node '.channel-about--description' on ${url}`,
      });
    }

    return Result.ok(node.structuredText.trim());
  }

  public async getClaimFieldsByUrl(url: string): Promise<Result<ClaimField[]>> {
    const userMatch = /https:\/\/(?:www\.)?rumble\.com\/user\/([^/]+)\/?/.exec(
      url,
    );
    if (userMatch) {
      return Result.ok([
        {
          key: 0,
          value: userMatch[1],
        },
      ]);
    }

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

    return Result.err({ message: 'Failed to match either channel or user.' });
  }
}

export const Rumble: Platform = {
  name: 'Rumble',
  verifiers: [new RumbleTextVerifier()],
  version: 1,
};
