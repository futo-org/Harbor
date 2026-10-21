#!/usr/bin/env node
// What staging and production run: the commit each chart's environment tag
// pins (its appVersion) and whether the image tag agrees. Reads the registry
// anonymously, so it works locally: node .forgejo/scripts/deployed.mjs
//
// Built is when the chart was packaged, not when the tag moved.
// Env: REGISTRY (default registry.futo.org/harbor).

import { readdirSync, readFileSync } from 'node:fs';
import { chartAt, digest, registry } from './registry-helpers.mjs';

const environments = ['staging', 'production'];

const charts = readdirSync('deploy/charts')
  .sort()
  .map((name) => {
    const values = readFileSync(`deploy/charts/${name}/values.yaml`, 'utf8');
    const repository = values.match(/^\s*repository:\s*(\S+)/m)?.[1] ?? '';
    const image = repository.startsWith(`${registry}/`)
      ? repository.slice(registry.length + 1)
      : null;
    return { name, image };
  });

const row = async ({ name, image }, environment) => {
  const chart = await chartAt(name, environment);
  if (!chart) return [name, '-', '-', '-', 'not deployed'];
  let state = 'ok';
  if (image) {
    const [live, pinned] = await Promise.all([
      digest(image, environment),
      digest(image, chart.commit),
    ]);
    if (!pinned) state = 'image missing';
    else if (live !== pinned) state = 'image tag differs';
  }
  return [
    name,
    chart.version,
    chart.commit.slice(0, 8),
    chart.built.replace('T', ' ').slice(0, 16),
    state,
  ];
};

const widths = [26, 30, 10, 18];
const print = (cells) =>
  console.log(
    `  ${cells.map((c, i) => (i < widths.length ? c.padEnd(widths[i]) : c)).join('')}`,
  );

for (const environment of environments) {
  const rows = await Promise.all(charts.map((c) => row(c, environment)));
  console.log(environment);
  print(['chart', 'version', 'commit', 'built', 'state']);
  for (const cells of rows) print(cells);
  console.log();
}
