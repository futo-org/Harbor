import path from "path";

export default [
  {
    entry: "./src/index.ts",
    target: "node",
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          use: "ts-loader",
          exclude: /node_modules/,
        },
      ],
    },
    resolve: {
      extensions: [".tsx", ".ts", ".js"],
    },
    experiments: {
      outputModule: true,
    },
    output: {
      filename: "index.es.js",
      path: path.join(import.meta.dirname, "dist"),
      library: {
        type: "module",
      },
    },
    mode: "development",
  },
  {
    entry: "./src/index.ts",
    target: "node",
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          use: "ts-loader",
          exclude: /node_modules/,
        },
      ],
    },
    resolve: {
      extensions: [".tsx", ".ts", ".js"],
    },
    output: {
      filename: "index.cjs.js",
      path: path.join(import.meta.dirname, "dist"),
      library: {
        type: "commonjs2",
      },
    },
    mode: "development",
  },
];
