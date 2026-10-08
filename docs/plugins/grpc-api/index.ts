import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import type { LoadContext, Plugin } from '@docusaurus/types';
import { renderReferenceMdx } from './mdx';
import { buildModel, type ImageJson } from './model';
import type { ApiModel } from './types';

const PACKAGE = 'polycentric.v2';
const PROTO_DIR = 'protos/polycentric/v2';
const PARTIAL = 'content/protocol/_grpc-reference.mdx';

/**
 * Builds the gRPC API reference from the proto files. `buf build` compiles
 * them (with comments) to a descriptor image, which ./model.ts turns into a
 * model. Two things are written from it:
 *
 * - `content/protocol/_grpc-reference.mdx`, a partial with a heading per
 *   service and method that the gRPC page imports, so the page's table of
 *   contents lists them. Written when the plugin initializes, before the docs
 *   plugin reads the content directory.
 * - `.docusaurus/grpc-api/default/api.json`, imported by the components in
 *   src/components/grpc as `@generated/grpc-api/default/api.json`.
 *
 * Edits to the proto files reload the site in `docusaurus start`.
 */
export default function grpcApiPlugin(context: LoadContext): Plugin<unknown> {
  const repoRoot = path.resolve(context.siteDir, '..');
  const protoDir = path.join(repoRoot, PROTO_DIR);
  const resolve = createRequire(import.meta.url).resolve;
  const bufBin = path.join(
    path.dirname(resolve('@bufbuild/buf/package.json')),
    'bin',
    'buf',
  );

  const stdout = execFileSync(
    process.execPath,
    [bufBin, 'build', '--path', PROTO_DIR, '-o', '-#format=json'],
    { cwd: repoRoot, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  const model: ApiModel = buildModel(JSON.parse(stdout) as ImageJson, PACKAGE);

  const partialPath = path.join(context.siteDir, PARTIAL);
  const partial = renderReferenceMdx(model);
  const current = fs.existsSync(partialPath)
    ? fs.readFileSync(partialPath, 'utf8')
    : null;
  if (current !== partial) fs.writeFileSync(partialPath, partial);

  return {
    name: 'grpc-api',

    async loadContent() {
      return model;
    },

    async contentLoaded({ content, actions }) {
      await actions.createData('api.json', JSON.stringify(content));
    },

    getPathsToWatch() {
      return fs
        .readdirSync(protoDir)
        .filter((name) => name.endsWith('.proto'))
        .map((name) => path.join(protoDir, name));
    },
  };
}
