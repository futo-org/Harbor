const expoPreset = require('jest-expo/jest-preset');

// Packages that ship ESM only and so must be transformed like the app code.
const ESM_ONLY_PACKAGES = ['fuzzysort'];

/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  transformIgnorePatterns: expoPreset.transformIgnorePatterns.map(
    (pattern, index) =>
      // The preset's first pattern is `/node_modules/(?!(pkg1|pkg2|...))`;
      // extend its allow-list.
      index === 0 && pattern.startsWith('/node_modules/(?!(')
        ? pattern.replace('(?!(', `(?!(${ESM_ONLY_PACKAGES.join('|')}|`)
        : pattern,
  ),
  // Appends to (does not replace) the preset's setupFiles, which jest-expo uses
  // for native setup. setupFilesAfterEnv is undefined in the preset.
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
};
