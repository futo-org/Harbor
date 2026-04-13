import path from 'path';

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
