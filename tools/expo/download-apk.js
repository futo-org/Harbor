#!/usr/bin/env node
// Downloads the APK produced by an EAS build.
//
// Usage: node tools/expo/download-apk.js [eas-build.json] [output.apk]
//
// Reads the JSON emitted by `eas-cli build --json`, extracts the application
// archive URL and downloads it. Defaults: ./eas-build.json -> ./polycentric.apk.

const fs = require('fs');

const inputPath = process.argv[2] || 'eas-build.json';
const outputPath = process.argv[3] || 'polycentric.apk';

const raw = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const build = Array.isArray(raw) ? raw[0] : raw;
const artifacts = (build && build.artifacts) || {};
const url = artifacts.applicationArchiveUrl || artifacts.buildUrl;

if (!url) {
  console.error(`No APK URL found in ${inputPath}`);
  process.exit(1);
}

console.error(`Downloading ${url} -> ${outputPath}`);

fetch(url)
  .then((res) => {
    if (!res.ok) {
      throw new Error(`Failed to download APK: HTTP ${res.status}`);
    }
    return res.arrayBuffer();
  })
  .then((buf) => {
    fs.writeFileSync(outputPath, Buffer.from(buf));
    console.error(`Wrote ${outputPath}`);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
