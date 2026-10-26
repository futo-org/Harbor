// Writes app-store/ and play-store/ from listing.mjs.
//
//   node apps/harbor/marketing/source/export.mjs          # write
//   node apps/harbor/marketing/source/export.mjs --check  # fail if out of date
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  appStore,
  dataCollection,
  overLimit,
  playStore,
  purposeNames,
  urls,
} from './listing.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const check = process.argv.includes('--check');

function applePrivacy() {
  const rows = new Map();
  for (const t of dataCollection.types) {
    const key = `${t.apple.category}/${t.apple.type}`;
    const row = rows.get(key) ?? {
      category: t.apple.category,
      type: t.apple.type,
      what: [],
      purposes: new Set(),
    };
    row.what.push(t.what);
    for (const p of t.purposes) row.purposes.add(purposeNames[p].apple);
    rows.set(key, row);
  }
  return [...rows.values()].map((r) => ({
    ...r,
    what: r.what.join('; '),
    purposes: [...r.purposes],
  }));
}

function dataSafetyCsv() {
  const template = fs.readFileSync(
    path.join(here, 'assets', 'data-safety-template.csv'),
    'utf8',
  );
  const rows = parseCsv(template);
  const types = {};
  for (const t of dataCollection.types) {
    if (!types[t.google]) {
      types[t.google] = { required: false, purposes: new Set() };
    }
    const entry = types[t.google];
    entry.required = entry.required || t.required;
    for (const p of t.purposes) entry.purposes.add(purposeNames[p].google);
  }
  const answers = {
    collectsPersonalData: dataCollection.types.length > 0,
    encryptedInTransit: dataCollection.encryptedInTransit,
    userRequestDelete: dataCollection.userRequestDelete,
    types,
  };
  const bool = (v) => (v ? 'TRUE' : 'FALSE');
  const out = rows.map((row, i) => {
    if (i === 0) return row;
    const [question, response] = row;
    let value = '';
    const account = dataCollection.accountCreation;
    const createsAccounts = !account.methods.includes('PSL_ACM_NONE');
    if (question === 'PSL_DATA_COLLECTION_COLLECTS_PERSONAL_DATA') {
      value = bool(answers.collectsPersonalData);
    } else if (question === 'PSL_DATA_COLLECTION_ENCRYPTED_IN_TRANSIT') {
      value = bool(answers.encryptedInTransit);
    } else if (question === 'PSL_SUPPORT_DATA_DELETION_BY_USER') {
      value = bool(
        response ===
          (answers.userRequestDelete
            ? 'DATA_DELETION_YES'
            : 'DATA_DELETION_NO'),
      );
    } else if (question === 'PSL_DATA_DELETION_URL') {
      value = answers.userRequestDelete ? dataCollection.dataDeletionUrl : '';
    } else if (question === 'PSL_SUPPORTED_ACCOUNT_CREATION_METHODS') {
      value = bool(account.methods.includes(response));
    } else if (question === 'PSL_ACM_SPECIFY') {
      value = account.methods.includes('PSL_ACM_OTHER')
        ? account.description
        : '';
    } else if (question === 'PSL_ACCOUNT_DELETION_URL') {
      value = createsAccounts ? account.deletionUrl : '';
    } else if (
      question === 'PSL_HAS_OUTSIDE_APP_ACCOUNTS' ||
      question === 'PSL_OUTSIDE_APP_ACCOUNT_TYPES' ||
      question === 'PSL_OUTSIDE_APP_ACCOUNT_TYPE_SPECIFY'
    ) {
      value = createsAccounts ? '' : bool(dataCollection.outsideAppAccounts);
      if (question !== 'PSL_HAS_OUTSIDE_APP_ACCOUNTS') value = '';
    } else if (question === 'PSL_INDEPENDENTLY_VALIDATED') {
      value = bool(dataCollection.independentSecurityReview);
    } else if (
      question === 'PSL_DATA_COLLECTION_COMPLIES_FAMILY_POLICY' ||
      question === 'PSL_UPI_BADGE_OPT_IN'
    ) {
      value = '';
    } else if (question.startsWith('PSL_DATA_TYPES_')) {
      value = bool(response in answers.types);
    } else if (question.startsWith('PSL_DATA_USAGE_RESPONSES:')) {
      const [, type, usage] = question.split(':');
      const t = answers.types[type];
      if (t) {
        const shared = t.shared ?? false;
        switch (usage) {
          case 'PSL_DATA_USAGE_COLLECTION_AND_SHARING':
            value = bool(
              response === 'PSL_DATA_USAGE_ONLY_COLLECTED'
                ? t.collected !== false
                : shared,
            );
            break;
          case 'PSL_DATA_USAGE_EPHEMERAL':
            value = bool(t.ephemeral ?? false);
            break;
          case 'DATA_USAGE_USER_CONTROL':
            value = bool(
              response === 'PSL_DATA_USAGE_USER_CONTROL_REQUIRED'
                ? t.required
                : !t.required,
            );
            break;
          case 'DATA_USAGE_COLLECTION_PURPOSE':
            value = bool(t.purposes.has(response));
            break;
          case 'DATA_USAGE_SHARING_PURPOSE':
            value = shared
              ? bool((t.sharingPurposes ?? t.purposes).includes(response))
              : '';
            break;
          default:
            throw new Error(`unknown data safety question ${question}`);
        }
      }
    } else {
      throw new Error(`unknown data safety question ${question}`);
    }
    return [row[0], row[1], value, row[3], row[4]];
  });
  return `${out.map((r) => r.map(csvField).join(',')).join('\n')}\n`;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.length > 1 || r[0] !== '');
}

const csvField = (v) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

const outputs = {
  'play-store/data-safety.csv': dataSafetyCsv(),
  'app-store/listing.json': `${JSON.stringify({ ...appStore, urls, appPrivacy: applePrivacy() }, null, 2)}\n`,
  'play-store/listing.json': `${JSON.stringify({ ...playStore, urls, dataCollection }, null, 2)}\n`,
};

const over = [...overLimit(appStore), ...overLimit(playStore)];
if (over.length) {
  console.error(`Over store limits: ${over.join(', ')}`);
  process.exit(1);
}

const stale = [];
for (const [rel, content] of Object.entries(outputs)) {
  const file = path.join(root, rel);
  if (check) {
    if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== content)
      stale.push(rel);
  } else {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
    console.log(rel);
  }
}
if (stale.length) {
  console.error(
    `Out of date, run node apps/harbor/marketing/source/export.mjs: ${stale.join(', ')}`,
  );
  process.exit(1);
}
