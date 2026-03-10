const path = require('path');
const dotenv = require('dotenv');
const { getConfig } = require('react-native-builder-bob/babel-config');
const pkg = require('../package.json');

// .env is expected at example/.env (next to this babel.config.js)
dotenv.config({ path: path.resolve(__dirname, '.env') });

const root = path.resolve(__dirname, '..');

module.exports = getConfig(
  {
    presets: ['module:@react-native/babel-preset'],
    plugins: [
      [
        'transform-inline-environment-variables',
        { include: ['POLYCENTRIC_SERVER'] },
      ],
    ],
  },
  { root, pkg }
);
