import api from '@generated/grpc-api/default/api.json';
import type { ApiModel } from '@site/plugins/grpc-api/types';

export const model: ApiModel = api;

/** `polycentric.v2.EventBundle` to `EventBundle`. */
export function shortName(typeName: string): string {
  const prefix = `${model.package}.`;
  return typeName.startsWith(prefix) ? typeName.slice(prefix.length) : typeName;
}

export function schemaAnchor(typeName: string): string {
  return `schema-${shortName(typeName)}`;
}

export function methodAnchor(service: string, method: string): string {
  return `${service}.${method}`;
}

export function fileBasename(file: string): string {
  return file.slice(file.lastIndexOf('/') + 1);
}

/** First sentence of a comment, for one-line summaries. */
export function summary(comment: string): string {
  const text = comment.split('\n\n')[0]?.replace(/\s+/g, ' ').trim() ?? '';
  const sentenceEnd = /\.(?=\s|$)/g;
  for (const match of text.matchAll(sentenceEnd)) {
    const before = text.slice(0, match.index);
    if (/\b(e\.g|i\.e|etc|vs)$/.test(before)) continue;
    return text.slice(0, match.index + 1);
  }
  return text;
}
