import path from 'path';

// `@polycentric/rs-core-wasm` is the wasm-backed bindings package; bundling
// it would also drag in its uniffi runtime and the wasm asset. Externalising
// it leaves a bare import that consumers' bundlers (Metro, vite) or Node
// resolve at runtime. Node built-ins are left to Node.
const externals = {
  '@polycentric/rs-core-wasm': '@polycentric/rs-core-wasm',
  '@polycentric/rs-core-wasm/generated': '@polycentric/rs-core-wasm/generated',
  '@polycentric/rs-core-wasm/web': '@polycentric/rs-core-wasm/web',
  '@polycentric/rs-core-wasm/client-worker':
    '@polycentric/rs-core-wasm/client-worker',
  'node:fs': 'node:fs',
  'node:path': 'node:path',
};

// One compilation per module format, with every entry point in it, so the
// entries share one copy of the client and its binding registry.
const entry = {
  index: './src/index.ts',
  web: './src/hosts/web.ts',
  node: './src/hosts/node.ts',
};

const rules = [
  {
    test: /\.tsx?$/,
    use: {
      loader: 'ts-loader',
      options: { projectReferences: false },
    },
    exclude: /node_modules/,
  },
];

export default [
  {
    entry,
    module: { rules },
    resolve: { extensions: ['.tsx', '.ts', '.js'] },
    experiments: { outputModule: true },
    externalsType: 'module',
    externals,
    optimization: {
      runtimeChunk: 'single',
      splitChunks: { chunks: 'all', minSize: 0 },
    },
    output: {
      filename: '[name].es.js',
      chunkFilename: 'chunks/[name].[contenthash].es.js',
      chunkFormat: 'module',
      path: path.join(import.meta.dirname, 'dist'),
      library: { type: 'module' },
    },
    mode: 'production',
  },
  {
    entry,
    module: { rules },
    resolve: { extensions: ['.tsx', '.ts', '.js'] },
    externalsType: 'commonjs',
    externals,
    optimization: {
      runtimeChunk: 'single',
      splitChunks: { chunks: 'all', minSize: 0 },
    },
    output: {
      filename: '[name].cjs.js',
      chunkFilename: 'chunks/[name].[contenthash].cjs.js',
      path: path.join(import.meta.dirname, 'dist'),
      library: { type: 'commonjs2' },
    },
    target: 'node',
    mode: 'production',
  },
];
