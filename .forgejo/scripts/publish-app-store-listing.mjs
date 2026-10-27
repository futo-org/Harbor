// Pushes apps/harbor/marketing to App Store Connect.
//
//   node .forgejo/scripts/publish-app-store-listing.mjs [--dry-run] [--skip-screenshots] [--skip-creative-assets]
//
// Env: ASC_KEY_ID, ASC_ISSUER_ID, ASC_PRIVATE_KEY (.p8 contents), optional
// ASC_VERSION, ASC_REVIEW_FIRST_NAME, ASC_REVIEW_LAST_NAME, ASC_REVIEW_EMAIL,
// ASC_REVIEW_PHONE.

import { createHash, createSign } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');

const marketing = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../apps/harbor/marketing',
);
const listing = JSON.parse(
  readFileSync(path.join(marketing, 'app-store/listing.json'), 'utf8'),
);
const appId = listing.appId;

function env(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`missing required env var ${name}`);
    process.exit(1);
  }
  return value;
}

// Client

const keyId = env('ASC_KEY_ID');
const issuerId = env('ASC_ISSUER_ID');
const privateKey = env('ASC_PRIVATE_KEY').replace(/\\n/g, '\n');

function token() {
  const b64 = (value) => Buffer.from(value).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const header = b64(JSON.stringify({ alg: 'ES256', kid: keyId, typ: 'JWT' }));
  const payload = b64(
    JSON.stringify({
      iss: issuerId,
      iat: now,
      exp: now + 600,
      aud: 'appstoreconnect-v1',
    }),
  );
  const signature = createSign('SHA256')
    .update(`${header}.${payload}`)
    .sign({ key: privateKey, dsaEncoding: 'ieee-p1363' });
  return `${header}.${payload}.${b64(signature)}`;
}

const BASE = 'https://api.appstoreconnect.apple.com';

async function request(method, route, body) {
  const url = route.startsWith('http') ? route : `${BASE}/v1${route}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token()}`,
      'Content-Type': 'application/json',
    },
    body: body && JSON.stringify(body),
  });
  if (res.status === 204) return null;
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const error = new Error(
      `${method} ${route} -> ${res.status} ${JSON.stringify(json?.errors ?? json)}`,
    );
    error.status = res.status;
    error.errors = json?.errors ?? [];
    throw error;
  }
  return json;
}

const get = (route) => request('GET', route);

async function getOrNull(route) {
  try {
    return (await get(route)).data;
  } catch (error) {
    if (error.status === 404) return null;
    throw error;
  }
}

async function getAll(route) {
  const items = [];
  let next = route;
  while (next) {
    const page = await get(next);
    items.push(...page.data);
    next = page.links?.next;
  }
  return items;
}

async function write(method, route, body) {
  if (dryRun) {
    const summary = body?.data?.attributes ?? body ?? '';
    console.log(`[dry-run] ${method} ${route} ${JSON.stringify(summary)}`);
    return { data: { id: 'dry-run', attributes: {} } };
  }
  return request(method, route, body);
}

const post = (route, body) => write('POST', route, body);
const patch = (route, body) => write('PATCH', route, body);
const remove = (route) => write('DELETE', route);

const ref = (type, id) => ({ data: { type, id } });

// Helpers

function show(value) {
  const text = JSON.stringify(value ?? null);
  return text.length > 60 ? `${text.slice(0, 57)}...` : text;
}

function diff(current, wanted) {
  return Object.fromEntries(
    Object.entries(wanted).filter(
      ([key, value]) => (current[key] ?? null) !== value,
    ),
  );
}

async function patchChanged(type, resource, attributes) {
  const changes = diff(resource.attributes, attributes);
  for (const [key, value] of Object.entries(changes)) {
    console.log(
      `${type} ${key}: ${show(resource.attributes[key])} -> ${show(value)}`,
    );
  }
  if (Object.keys(changes).length === 0) {
    console.log(`${type} up to date`);
    return;
  }
  await patch(`/${type}/${resource.id}`, {
    data: { type, id: resource.id, attributes: changes },
  });
}

async function upsertLocalization(parentType, parentId, type, attributes) {
  const { data } = await get(`/${parentType}s/${parentId}/${type}?limit=200`);
  const existing = data.find((l) => l.attributes.locale === listing.locale);
  if (existing) {
    await patchChanged(type, existing, attributes);
    return existing;
  }
  const { data: created } = await post(`/${type}`, {
    data: {
      type,
      attributes: { ...attributes, locale: listing.locale },
      relationships: { [parentType]: ref(`${parentType}s`, parentId) },
    },
  });
  return created;
}

const md5 = (bytes) => createHash('md5').update(bytes).digest('hex');

function pngFiles(dir) {
  const folder = path.join(marketing, dir);
  const files = readdirSync(folder)
    .filter((f) => f.endsWith('.png'))
    .sort()
    .map((f) => path.join(folder, f));
  if (files.length === 0) throw new Error(`no screenshots in ${dir}`);
  return files;
}

async function uploadChunks(bytes, operations, name) {
  for (const op of operations) {
    const res = await fetch(op.url, {
      method: op.method,
      headers: Object.fromEntries(
        op.requestHeaders.map((h) => [h.name, h.value]),
      ),
      body: bytes.subarray(op.offset, op.offset + op.length),
    });
    if (!res.ok) throw new Error(`upload chunk of ${name} -> ${res.status}`);
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Version

const EDITABLE = new Set([
  'PREPARE_FOR_SUBMISSION',
  'DEVELOPER_REJECTED',
  'REJECTED',
  'METADATA_REJECTED',
  'INVALID_BINARY',
]);

const stateOf = (item) =>
  item.attributes.appVersionState ??
  item.attributes.appStoreState ??
  item.attributes.state;

async function editableVersion() {
  const { data } = await get(
    `/apps/${appId}/appStoreVersions?filter[platform]=IOS&limit=20`,
  );
  const found = data.find((v) => EDITABLE.has(stateOf(v)));
  if (found) {
    console.log(
      `Version ${found.attributes.versionString} (${stateOf(found)})`,
    );
    return found;
  }
  const versionString = process.env.ASC_VERSION;
  if (!versionString) {
    const states = data
      .map((v) => `${v.attributes.versionString}=${stateOf(v)}`)
      .join(', ');
    console.error(
      `No editable App Store version (${states || 'none'}). Set ASC_VERSION to create one.`,
    );
    process.exit(1);
  }
  console.log(`Creating version ${versionString}`);
  const { data: created } = await post('/appStoreVersions', {
    data: {
      type: 'appStoreVersions',
      attributes: { platform: 'IOS', versionString },
      relationships: { app: ref('apps', appId) },
    },
  });
  return created;
}

async function pushVersion(version) {
  await patchChanged('appStoreVersions', version, {
    copyright: listing.copyright,
    releaseType: listing.releaseType,
  });
  const attributes = {
    description: listing.description,
    keywords: listing.keywords.join(','),
    promotionalText: listing.promotionalText,
    marketingUrl: listing.urls.marketing,
    supportUrl: listing.urls.support,
    whatsNew: listing.whatsNew,
  };
  const upsert = (attrs) =>
    upsertLocalization(
      'appStoreVersion',
      version.id,
      'appStoreVersionLocalizations',
      attrs,
    );
  try {
    return await upsert(attributes);
  } catch (error) {
    const whatsNewRejected = error.errors?.some((e) =>
      /whatsNew/i.test(JSON.stringify(e)),
    );
    if (!whatsNewRejected) throw error;
    console.log("What's New rejected for this version; pushing without it");
    const { whatsNew: _, ...rest } = attributes;
    return upsert(rest);
  }
}

async function pushReviewDetail(version) {
  const contact = {
    contactFirstName: process.env.ASC_REVIEW_FIRST_NAME,
    contactLastName: process.env.ASC_REVIEW_LAST_NAME,
    contactEmail: process.env.ASC_REVIEW_EMAIL,
    contactPhone: process.env.ASC_REVIEW_PHONE,
  };
  const hasContact = Object.values(contact).every(Boolean);
  const attributes = {
    demoAccountRequired: false,
    notes: listing.reviewNotes,
    ...(hasContact ? contact : {}),
  };
  const existing = await getOrNull(
    `/appStoreVersions/${version.id}/appStoreReviewDetail`,
  );
  if (existing) {
    await patchChanged('appStoreReviewDetails', existing, attributes);
  } else if (!hasContact) {
    console.warn(
      'No App Review detail yet and ASC_REVIEW_* are not all set; skipping review notes',
    );
  } else {
    await post('/appStoreReviewDetails', {
      data: {
        type: 'appStoreReviewDetails',
        attributes,
        relationships: { appStoreVersion: ref('appStoreVersions', version.id) },
      },
    });
  }
}

// App

async function pushApp() {
  const { data: app } = await get(`/apps/${appId}`);
  await patchChanged('apps', app, {
    contentRightsDeclaration: listing.contentRightsDeclaration,
  });
}

async function pushAppInfo() {
  const { data } = await get(`/apps/${appId}/appInfos`);
  const info = data.find((i) => EDITABLE.has(stateOf(i))) ?? data.at(-1);
  if (!info) throw new Error('no appInfos for app');
  console.log(`App info ${info.id} (${stateOf(info)})`);

  const { data: rating } = await get(
    `/appInfos/${info.id}/ageRatingDeclaration`,
  );
  await patchChanged('ageRatingDeclarations', rating, listing.ageRating);

  await patch(`/appInfos/${info.id}`, {
    data: {
      type: 'appInfos',
      id: info.id,
      relationships: {
        primaryCategory: ref('appCategories', listing.primaryCategory),
        secondaryCategory: ref('appCategories', listing.secondaryCategory),
      },
    },
  });

  await upsertLocalization('appInfo', info.id, 'appInfoLocalizations', {
    name: listing.name,
    subtitle: listing.subtitle,
    privacyPolicyUrl: listing.urls.privacyPolicy,
  });
}

async function pushPrice() {
  const { baseTerritory, customerPrice } = listing.price;
  const schedule = await getOrNull(`/apps/${appId}/appPriceSchedule`);
  if (schedule) {
    const { included = [] } = await get(
      `/appPriceSchedules/${schedule.id}/manualPrices?include=appPricePoint&limit=50`,
    );
    const prices = included
      .filter((i) => i.type === 'appPricePoints')
      .map((i) => i.attributes.customerPrice);
    if (prices.includes(customerPrice)) {
      console.log(`price ${customerPrice} already scheduled`);
      return;
    }
    console.log(`price: ${show(prices)} -> ${customerPrice}`);
  } else {
    console.log(`price: none -> ${customerPrice}`);
  }

  const points = await getAll(
    `/apps/${appId}/appPricePoints?filter[territory]=${baseTerritory}&limit=200`,
  );
  const point = points.find(
    (p) => p.attributes.customerPrice === customerPrice,
  );
  if (!point) {
    throw new Error(`no ${baseTerritory} price point for ${customerPrice}`);
  }
  await post('/appPriceSchedules', {
    data: {
      type: 'appPriceSchedules',
      relationships: {
        app: ref('apps', appId),
        baseTerritory: ref('territories', baseTerritory),
        manualPrices: { data: [{ type: 'appPrices', id: '${price}' }] },
      },
    },
    included: [
      {
        type: 'appPrices',
        id: '${price}',
        attributes: { startDate: null },
        relationships: { appPricePoint: ref('appPricePoints', point.id) },
      },
    ],
  });
}

async function pushAvailability() {
  const { allTerritories, availableInNewTerritories } = listing.availability;
  if (!allTerritories) {
    console.log('availability: only all territories is supported; skipping');
    return;
  }
  const territories = (await get('/territories?limit=200')).data.map(
    (t) => t.id,
  );
  const current = await getOrNull(`/apps/${appId}/appAvailabilityV2`);

  if (!current) {
    console.log(`availability: none -> ${territories.length} territories`);
    const tempId = (id) => `\${${id}}`;
    await post(`${BASE}/v2/appAvailabilities`, {
      data: {
        type: 'appAvailabilities',
        attributes: { availableInNewTerritories },
        relationships: {
          app: ref('apps', appId),
          territoryAvailabilities: {
            data: territories.map((id) => ({
              type: 'territoryAvailabilities',
              id: tempId(id),
            })),
          },
        },
      },
      included: territories.map((id) => ({
        type: 'territoryAvailabilities',
        id: tempId(id),
        attributes: { available: true },
        relationships: { territory: ref('territories', id) },
      })),
    });
    return;
  }

  if (
    current.attributes.availableInNewTerritories !== availableInNewTerritories
  ) {
    console.warn(
      `availability: availableInNewTerritories is ${current.attributes.availableInNewTerritories}; the API cannot change it`,
    );
  }
  const rows = await getAll(
    `${BASE}/v2/appAvailabilities/${current.id}/territoryAvailabilities?limit=200`,
  );
  const missing = rows.filter(
    (t) =>
      !t.attributes.available &&
      territories.includes(t.relationships?.territory?.data?.id),
  );
  if (missing.length === 0) {
    console.log(
      `availability: all ${territories.length} territories available`,
    );
    return;
  }
  console.log(`availability: enabling ${missing.length} territories`);
  for (const t of missing) {
    await patch(`/territoryAvailabilities/${t.id}`, {
      data: {
        type: 'territoryAvailabilities',
        id: t.id,
        attributes: { available: true },
      },
    });
  }
}

// Screenshots

async function uploadScreenshot(setId, file) {
  const bytes = readFileSync(file);
  const fileName = path.basename(file);
  const { data: shot } = await post('/appScreenshots', {
    data: {
      type: 'appScreenshots',
      attributes: { fileName, fileSize: bytes.length },
      relationships: { appScreenshotSet: ref('appScreenshotSets', setId) },
    },
  });
  if (dryRun) return shot.id;
  await uploadChunks(bytes, shot.attributes.uploadOperations, fileName);
  await patch(`/appScreenshots/${shot.id}`, {
    data: {
      type: 'appScreenshots',
      id: shot.id,
      attributes: { uploaded: true, sourceFileChecksum: md5(bytes) },
    },
  });
  return shot.id;
}

async function pushScreenshots(localization) {
  for (const [displayType, dir] of Object.entries(listing.screenshots)) {
    const files = pngFiles(dir);
    const { data: sets } = await get(
      `/appStoreVersionLocalizations/${localization.id}/appScreenshotSets?filter[screenshotDisplayType]=${displayType}`,
    );
    let set = sets[0];
    let existing = [];
    if (set) {
      existing = (
        await get(`/appScreenshotSets/${set.id}/appScreenshots?limit=50`)
      ).data;
    } else {
      set = (
        await post('/appScreenshotSets', {
          data: {
            type: 'appScreenshotSets',
            attributes: { screenshotDisplayType: displayType },
            relationships: {
              appStoreVersionLocalization: ref(
                'appStoreVersionLocalizations',
                localization.id,
              ),
            },
          },
        })
      ).data;
    }

    const wanted = files.map(
      (f) => `${path.basename(f)}:${md5(readFileSync(f))}`,
    );
    const have = existing.map(
      (s) => `${s.attributes.fileName}:${s.attributes.sourceFileChecksum}`,
    );
    if (wanted.join() === have.join()) {
      console.log(`${displayType}: ${files.length} screenshots current`);
      continue;
    }
    console.log(
      `${displayType}: replacing ${existing.length} with ${files.length}`,
    );
    for (const shot of existing) await remove(`/appScreenshots/${shot.id}`);
    const ids = [];
    for (const file of files) ids.push(await uploadScreenshot(set.id, file));
    await patch(`/appScreenshotSets/${set.id}/relationships/appScreenshots`, {
      data: ids.map((id) => ({ type: 'appScreenshots', id })),
    });
  }
}

// Creative assets (product page header, search results)

async function uploadLibraryImage(libraryId, file, referenceName) {
  const bytes = readFileSync(file);
  const fileName = path.basename(file);
  const { data: image } = await post('/appAssetLibraryImages', {
    data: {
      type: 'appAssetLibraryImages',
      attributes: {
        category: 'CREATIVE_ASSETS',
        fileName,
        fileSize: bytes.length,
        referenceName,
      },
      relationships: { assetLibrary: ref('appAssetLibraries', libraryId) },
    },
  });
  if (dryRun) return image;
  await uploadChunks(bytes, image.attributes.uploadOperations, fileName);
  await patch(`/appAssetLibraryImages/${image.id}`, {
    data: {
      type: 'appAssetLibraryImages',
      id: image.id,
      attributes: { uploaded: true },
    },
  });
  for (let i = 0; i < 60; i++) {
    await sleep(5000);
    const { data } = await get(`/appAssetLibraryImages/${image.id}`);
    const state = data.attributes.state;
    if (state === 'FAILED') {
      throw new Error(
        `${fileName} failed processing: ${JSON.stringify(data.attributes.stateDetails)}`,
      );
    }
    if (state !== 'AWAITING_UPLOAD' && state !== 'UPLOAD_COMPLETE') return data;
  }
  throw new Error(`${fileName} still processing after 5 minutes`);
}

function placementGroups(refData, placementType) {
  const allowed = new Set(
    refData.features.flatMap((f) =>
      f.placementPolicies
        .filter((p) => p.placementType === placementType)
        .flatMap((p) => p.groupLimits.flatMap((g) => g.groupIds)),
    ),
  );
  return refData.placementProfileGroups
    .filter(
      (g) =>
        allowed.has(g.placementProfileGroupId) &&
        ['IPHONE_APP_STORE', 'IPAD_APP_STORE', 'ANY'].includes(g.platform),
    )
    .map((g) => g.placementProfileGroupId);
}

async function pushCreativeAssets(localization) {
  const { data: library } = await get(`/apps/${appId}/assetLibrary`);
  const { data: refData } = await get('/appAssetLibraryRefData');
  const refs = refData[0]?.attributes ?? {
    features: [],
    placementProfileGroups: [],
  };
  const { data: images } = await get(
    `/appAssetLibraries/${library.id}/images?filter[category]=CREATIVE_ASSETS&include=placements&limit=200`,
  );
  const usable = (i) =>
    !['FAILED', 'REJECTED', 'ARCHIVED'].includes(i.attributes.state);
  const hasPlacements = (i) =>
    (i.relationships?.placements?.data ?? []).length > 0;
  const placementsOf = async (image, placementType) =>
    (
      await get(
        `/appAssetLibraryImages/${image.id}/placements?filter[placementType]=${placementType}&filter[appStoreVersionLocalization]=${localization.id}&limit=50`,
      )
    ).data;

  for (const [placementType, rel] of Object.entries(listing.creativeAssets)) {
    const file = path.join(marketing, rel);
    const referenceName = `${path.basename(file)}#${md5(readFileSync(file)).slice(0, 12)}`;

    let image = images.find(
      (i) => i.attributes.referenceName === referenceName && usable(i),
    );
    if (image) {
      console.log(
        `${placementType}: ${referenceName} in library (${image.attributes.state})`,
      );
    } else {
      console.log(`${placementType}: uploading ${referenceName}`);
      image = await uploadLibraryImage(library.id, file, referenceName);
    }

    for (const other of images) {
      if (other.id === image.id || !hasPlacements(other)) continue;
      for (const p of await placementsOf(other, placementType)) {
        console.log(
          `${placementType}: removing ${other.attributes.referenceName}`,
        );
        await remove(`/appAssetLibraryPlacements/${p.id}`);
      }
    }

    const existing =
      image.id === 'dry-run' ? [] : await placementsOf(image, placementType);
    const have = new Set(
      existing.map((p) => p.attributes.placementGroup ?? null),
    );
    const groups = placementGroups(refs, placementType);
    for (const group of groups.length ? groups : [null]) {
      if (have.has(group)) continue;
      console.log(
        `${placementType}: placing ${referenceName}${group ? ` in ${group}` : ''}`,
      );
      await post('/appAssetLibraryPlacements', {
        data: {
          type: 'appAssetLibraryPlacements',
          attributes: { placementType, placementGroup: group },
          relationships: {
            image: ref('appAssetLibraryImages', image.id),
            appStoreVersionLocalization: ref(
              'appStoreVersionLocalizations',
              localization.id,
            ),
          },
        },
      });
    }
  }
}

// Main

const version = await editableVersion();
await pushApp();
await pushAppInfo();
await pushPrice();
await pushAvailability();
const localization = await pushVersion(version);
await pushReviewDetail(version);
if (!args.has('--skip-screenshots')) await pushScreenshots(localization);
if (!args.has('--skip-creative-assets') && listing.creativeAssets) {
  await pushCreativeAssets(localization);
}
console.log(dryRun ? 'Dry run complete' : 'App Store listing updated');
