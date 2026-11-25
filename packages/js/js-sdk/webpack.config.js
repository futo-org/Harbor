import path from 'path';

// `@polycentric/js-wasm` is the wasm-backed bindings
// package; pulling it into js-sdk's bundle would also drag in its
// uniffi runtime (whose CJS index has relative requires that don't
// survive webpack cleanly) and the wasm asset. Externalising it
// leaves a clean bare import in the dist — consumers (apps' Metro /
// vite bundler) resolve the workspace package at runtime.
const externals = {
  '@polycentric/js-wasm': '@polycentric/js-wasm',
  '@polycentric/js-wasm/generated': '@polycentric/js-wasm/generated',
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
