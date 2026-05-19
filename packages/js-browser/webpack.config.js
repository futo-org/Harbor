import path from 'path';

export default [
  {
    entry: './src/index.ts',
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          use: 'ts-loader',
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
    externals: {
      '@polycentric/js-core': '@polycentric/js-core',
    },
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
          use: 'ts-loader',
          exclude: /node_modules/,
        },
      ],
    },
    resolve: {
      extensions: ['.tsx', '.ts', '.js'],
    },
    externals: {
      '@polycentric/js-core': '@polycentric/js-core',
    },
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
