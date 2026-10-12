// User-facing release notes written by Claude (via OpenRouter) from the
// commits since the previous release tag. The model is told to drop purely
// technical changes (CI, refactors, dependency bumps, tests) and describe the
// rest in plain language for app users. Needs the full history.
//
//   node release-notes.mjs [output-file]
//
// Env: GITHUB_REF_NAME (the tag), GITHUB_REPOSITORY, GITHUB_API_URL and
// GITHUB_TOKEN (author lookups; without a token nobody is credited),
// OPEN_ROUTER_API_TOKEN (required), OPEN_ROUTER_MODEL (optional override).

import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const tag = process.env.GITHUB_REF_NAME;
const repo = process.env.GITHUB_REPOSITORY;
const api = process.env.GITHUB_API_URL;
const token = process.env.GITHUB_TOKEN;
const openRouterToken = process.env.OPEN_ROUTER_API_TOKEN;
const model = process.env.OPEN_ROUTER_MODEL || 'anthropic/claude-sonnet-5.5';

if (!openRouterToken) {
  console.error('OPEN_ROUTER_API_TOKEN is not set; cannot write release notes');
  process.exit(1);
}

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' });

let previous = '';
try {
  previous = git(
    'describe',
    '--tags',
    '--abbrev=0',
    '--match',
    'v[0-9]*',
    `${tag}^`,
  ).trim();
} catch {
  // First release.
}

const FIELD = '\x1f';
const RECORD = '\x1e';
const log = git(
  'log',
  `--format=%H${FIELD}%s${FIELD}%b${RECORD}`,
  previous ? `${previous}..${tag}` : tag,
);

// Members of the repo (write or better) are not credited, like GitLab's
// `author.contributor`. Cached per login; a failed lookup credits nobody.
const membership = new Map();
async function get(path) {
  if (!api || !token) return null;
  const res = await fetch(`${api}/repos/${repo}${path}`, {
    headers: { Authorization: `token ${token}` },
  });
  return res.ok ? res.json() : null;
}
async function contributor(sha) {
  const commit = await get(`/git/commits/${sha}`);
  const login = commit?.author?.login;
  if (!login) return '';
  if (!membership.has(login)) {
    const perm = await get(
      `/collaborators/${encodeURIComponent(login)}/permission`,
    );
    membership.set(
      login,
      ['write', 'admin', 'owner'].includes(perm?.permission),
    );
  }
  return membership.get(login) ? '' : ` (community contribution by @${login})`;
}

const commits = [];
for (const record of log.split(RECORD)) {
  const [sha, subject, body = ''] = record.trim().split(FIELD);
  if (!sha || !subject) continue;
  // The Changelog trailer, where present, is a hint about the author's own
  // categorisation — pass it along, but every commit goes to the model.
  const category = body.match(/^Changelog:[ \t]*(\S+)/im)?.[1]?.toLowerCase();
  commits.push(
    `- ${subject}${category ? ` [${category}]` : ''}${await contributor(sha)}`,
  );
}

const version = tag.replace(/^v/, '');
const date = new Date().toISOString().slice(0, 10);
const header = `## ${version} (${date})\n\n`;

async function writeNotes(body) {
  const notes = `${header}${body.trim()}\n`;
  writeFileSync(process.argv[2] ?? 'release_notes.md', notes);
  process.stdout.write(notes);
}

if (commits.length === 0) {
  await writeNotes('No changes.');
  process.exit(0);
}

const SYSTEM_PROMPT = `You write release notes for Harbor, a social app built on the Polycentric protocol. Your audience is everyday app users, not developers.

Rules:
- Plain, friendly language. No jargon, no commit hashes, no file or module names, no protocol internals.
- Leave out purely technical changes entirely: CI/build/release tooling, refactors, dependency bumps, tests, linting, internal APIs, developer documentation. Do not mention that you left them out.
- Describe what changed from the user's point of view ("You can now...", "Fixed an issue where...").
- Group bullets under at most these headings, omitting empty ones: "### ✨ New", "### ⚡ Improvements", "### 🐛 Fixes".
- Merge related commits into a single bullet. Keep each bullet to one short sentence.
- Credit community contributions where marked, e.g. "— thanks @login!".
- If nothing in the list is user-facing, output exactly: "This release contains behind-the-scenes improvements and maintenance."
- Output only the markdown notes. No title line, no version number, no preamble or sign-off.`;

const userPrompt = `Commits in Harbor release ${version}${previous ? ` (since ${previous})` : ''}:\n\n${commits.join('\n')}`;

const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${openRouterToken}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model,
    max_tokens: 2000,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
  }),
});

if (!res.ok) {
  console.error(`OpenRouter request failed: ${res.status} ${await res.text()}`);
  process.exit(1);
}

const completion = await res.json();
const body = completion.choices?.[0]?.message?.content;
if (!body) {
  console.error(
    `OpenRouter returned no content: ${JSON.stringify(completion).slice(0, 2000)}`,
  );
  process.exit(1);
}

await writeNotes(body);
