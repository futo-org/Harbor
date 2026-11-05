// Posts the release to Zulip.
//
//   node announce-release.mjs [notes-file]
//
// Env: GITHUB_SERVER_URL, GITHUB_REPOSITORY, GITHUB_REF_NAME, ZULIP_BOT_EMAIL,
// ZULIP_BOT_API_KEY.

import { readFileSync } from 'node:fs';
import { postToZulip } from './zulip-helpers.mjs';

const tag = process.env.GITHUB_REF_NAME;
const url = `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/releases/tag/${tag}`;
const notes = readFileSync(process.argv[2] ?? 'release_notes.md', 'utf8');

await postToZulip(
  // #harbor-alerts
  123,
  'harbor-releases',
  `:rocket: **[Harbor ${tag}](${url}) released**\n\n${notes.slice(0, 9000)}`,
);
