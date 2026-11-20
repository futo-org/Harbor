import fs from 'node:fs';
import path from 'node:path';

/**
 * Fills a fenced code block from a region of a source file. This allows us
 * to compile and test the source file in CI, and then include that code in
 * the docs, preventing doc examples from drifting from the codebase.
 *
 * For `.proto` files, this plugin will instead accept definitions rather
 * than code regions.
 */

// Define mdast nodes this plugin uses.
type Node = { type: string; children?: Node[] };
type Code = Node & {
  type: 'code';
  lang?: string;
  meta?: string;
  value: string;
};
type VFile = { path: string };

const FILE_META = /(?:^|\s)file=(\S+)/;
const MARKER = /^\s*\/\/\s*#(region|endregion)\b\s*(\S*)\s*$/;

function findRepoRoot(from: string): string {
  let dir = path.dirname(from);
  while (!fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) {
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error(`code-region: no repo root above ${from}`);
    }
    dir = parent;
  }
  return dir;
}

function dedent(lines: string[]): string[] {
  const indents = lines
    .filter((line) => line.trim() !== '')
    .map((line) => line.match(/^ */)?.[0].length ?? 0);
  const indent = indents.length > 0 ? Math.min(...indents) : 0;
  return lines.map((line) => line.slice(indent));
}

function trimBlankLines(lines: string[]): string[] {
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start].trim() === '') start++;
  while (end > start && lines[end - 1].trim() === '') end--;
  return lines.slice(start, end);
}

/** The named region of `source`, or null if it has none. */
export function extractRegion(source: string, name: string): string | null {
  const spans: string[][] = [];
  let current: string[] | null = null;

  for (const line of source.split('\n')) {
    const marker = line.match(MARKER);
    if (marker) {
      const [, kind, markerName] = marker;
      if (markerName === name) {
        if (kind === 'region' && !current) {
          current = [];
        } else if (kind === 'endregion' && current) {
          spans.push(current);
          current = null;
        }
      }
      continue;
    }
    current?.push(line);
  }

  if (current) {
    throw new Error(`code-region: region "${name}" is never closed`);
  }
  if (spans.length === 0) return null;
  return spans
    .map((span) => trimBlankLines(dedent(span)).join('\n'))
    .join('\n\n');
}

const DEFINITION = /^\s*(?:message|enum|service)\s+(\w+)\s*\{/;

/** A proto definition with its leading comment, or null if it is not found. */
export function extractProtoDefinition(
  source: string,
  name: string,
): string | null {
  const lines = source.split('\n');
  const starts = lines.flatMap((line, i) =>
    line.match(DEFINITION)?.[1] === name ? [i] : [],
  );
  if (starts.length === 0) return null;
  if (starts.length > 1) {
    throw new Error(`code-region: "${name}" is defined more than once`);
  }
  const [start] = starts;

  // The definition ends when all open braces close. Note that comments might contain a brace
  // character
  let depth = 0;
  let end = start;
  for (; end < lines.length; end++) {
    const code = lines[end].replace(/\/\/.*$/, '');
    depth += (code.match(/\{/g) ?? []).length;
    depth -= (code.match(/\}/g) ?? []).length;
    if (depth === 0) break;
  }
  if (depth !== 0) {
    throw new Error(`code-region: "${name}" has unbalanced braces`);
  }

  let first = start;
  while (first > 0 && lines[first - 1].trim().startsWith('//')) first--;

  return dedent(lines.slice(first, end + 1)).join('\n');
}

function extractProtoDefinitions(source: string, names: string): string | null {
  const definitions: string[] = [];
  for (const name of names.split(',')) {
    const definition = extractProtoDefinition(source, name);
    if (definition === null) return null;
    definitions.push(definition);
  }
  return definitions.join('\n\n');
}

function visitCode(node: Node, visit: (code: Code) => void) {
  if (node.type === 'code') visit(node as Code);
  for (const child of node.children ?? []) visitCode(child, visit);
}

export default function codeRegion() {
  return (tree: Node, file: VFile) => {
    let root: string | undefined;

    visitCode(tree, (code) => {
      const match = code.meta?.match(FILE_META);
      if (!match) return;

      const [reference] = match.slice(1);
      const where = `${file.path}: ${reference}`;
      const [relativePath, region] = reference.split('#');
      if (!relativePath || !region) {
        throw new Error(
          `code-region: expected file=<path>#<region> (${where})`,
        );
      }
      if (code.value.trim() !== '') {
        throw new Error(
          `code-region: a block with file= must be empty, its content comes from the file (${where})`,
        );
      }

      root ??= findRepoRoot(file.path);
      const sourcePath = path.join(root, relativePath);
      if (!fs.existsSync(sourcePath)) {
        throw new Error(`code-region: no such file (${where})`);
      }
      const source = fs.readFileSync(sourcePath, 'utf8');
      const value = sourcePath.endsWith('.proto')
        ? extractProtoDefinitions(source, region)
        : extractRegion(source, region);
      if (value === null) {
        throw new Error(
          `code-region: no region or definition "${region}" (${where})`,
        );
      }

      code.value = value;
      code.meta = code.meta?.replace(FILE_META, '').trim() || undefined;
    });
  };
}
