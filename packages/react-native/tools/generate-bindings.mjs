#!/usr/bin/env node
// Generate everything uniffi-bindgen-react-native produces for this package
// from rs-core: the TypeScript (src/generated/rn) and C++ (cpp/generated) JSI
// bindings, and the TurboModule glue that loads them (cpp/, ios/,
// android/{CMakeLists.txt,build.gradle,cpp-adapter.cpp,src/main/...},
// ReactNative.podspec, src/NativeReactNative.ts, src/uniffi-init.tsx). None
// of it is committed. Builds rs-core for this machine (no Android NDK or
// Xcode needed) and runs ubrn on that library.
//
//   node tools/generate-bindings.mjs [--release]
//
// `ubrn:android` / `ubrn:ios` also generate them, with the native build.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const pkg = fileURLToPath(new URL('..', import.meta.url));
const rsCore = fileURLToPath(new URL('../../rs-core/', import.meta.url));
const profile = process.argv.includes('--release') ? 'release' : 'debug';

const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { cwd: rsCore, stdio: 'inherit', ...opts });

run('cargo', [
  'build',
  '-p',
  'polycentric-core',
  '--lib',
  ...(profile === 'release' ? ['--release'] : []),
]);

const { target_directory: target } = JSON.parse(
  execFileSync('cargo', ['metadata', '--format-version', '1', '--no-deps'], {
    cwd: rsCore,
    encoding: 'utf8',
  }),
);
const file =
  {
    darwin: 'libpolycentric_core.dylib',
    win32: 'polycentric_core.dll',
  }[process.platform] ?? 'libpolycentric_core.so';

// This package's ubrn, or rs-core-wasm's (same version, from the catalog), so
// CI's wasm job can generate without installing React Native.
const ubrn = [
  pkg,
  fileURLToPath(new URL('../../rs-core-wasm/', import.meta.url)),
]
  .map((dir) => `${dir}node_modules/.bin/ubrn`)
  .find((bin) => existsSync(bin));
if (!ubrn) throw new Error('uniffi-bindgen-react-native is not installed');

run(ubrn, [
  'generate',
  'jsi',
  'bindings',
  '--library',
  `${target}/${profile}/${file}`,
  '--ts-dir',
  `${pkg}src/generated/rn`,
  '--cpp-dir',
  `${pkg}cpp/generated`,
]);

// The TurboModule glue, for the namespaces just generated.
run(
  ubrn,
  [
    'generate',
    'jsi',
    'turbo-module',
    '--config',
    `${pkg}ubrn.config.yaml`,
    'polycentric_core',
    'polycentric_common',
  ],
  { cwd: pkg },
);
