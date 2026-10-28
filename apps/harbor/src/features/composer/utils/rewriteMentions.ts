import { parseTextLinks } from '@/src/common/util/parseTextLinks';
import type { RememberedMention } from '@/src/features/composer/hooks/useComposerStore';

// Rewrite inserted `@alias` / `@identity` mentions in text with
// @{identity,renderAs} mentions from a remembered map
export function rewriteMentions(
  text: string,
  mentions: Record<string, RememberedMention>,
): string {
  // Splice from the end so earlier offsets stay valid.
  for (const s of parseTextLinks(text).reverse()) {
    const insertedText =
      s.type === 'alias'
        ? s.alias
        : s.type === 'identity' && text[s.start + 1] !== '{'
          ? s.identity
          : null;
    const mention = insertedText && mentions[insertedText];
    if (!mention) continue;
    text = `${text.slice(0, s.start)}@{${mention.identity},${mention.renderAs}}${text.slice(s.end)}`;
  }
  return text;
}
