import path from 'path';

// `@polycentric/rs-core-wasm` is the wasm-backed bindings
// package; pulling it into js-core's bundle would also drag in its
// uniffi runtime (whose CJS index has relative requires that don't
// survive webpack cleanly) and the wasm asset. Externalising it
// leaves a clean bare import in the dist — consumers (apps' Metro /
// vite bundler) resolve the workspace package at runtime.
const externals = {
  '@polycentric/rs-core-wasm': '@polycentric/rs-core-wasm',
  '@polycentric/rs-core-wasm/generated': '@polycentric/rs-core-wasm/generated',
};

export default [
  {
    entry: './src/index.ts',
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          use: {
            loader: 'ts-loader',
            options: { projectReferences: true },
          },
          exclude: /node_modules/,
        },
      ],
    },
    resolve: {
      extensions: ['.tsx', '.ts', '.js'],
    },
    experiments: {
      outputModule: true,
    },
    externalsType: 'module',
    externals,
    output: {
      filename: 'index.es.js',
      path: path.join(import.meta.dirname, 'dist'),
      library: {
        type: 'module',
      },
    },
    mode: 'production',
  },
  {
    entry: './src/index.ts',
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          use: {
            loader: 'ts-loader',
            options: { projectReferences: true },
          },
          exclude: /node_modules/,
        },
      ],
    },
    resolve: {
      extensions: ['.tsx', '.ts', '.js'],
    },
    externalsType: 'commonjs',
    externals,
    output: {
      filename: 'index.cjs.js',
      path: path.join(import.meta.dirname, 'dist'),
      library: {
        type: 'commonjs2',
      },
    },
    mode: 'production',
  },
];
