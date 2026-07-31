/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  // Appends to (does not replace) the preset's setupFiles, which jest-expo uses
  // for native setup. setupFilesAfterEnv is undefined in the preset.
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
};
