import clsx from 'clsx';
import type { ReactNode } from 'react';
import styles from './ApiReference.module.css';

type Block = { kind: 'p' | 'pre'; text: string };

/**
 * Splits a proto comment into paragraphs. Blank lines separate paragraphs,
 * `- ` starts a list item and indented or `1 -> x` lines are kept verbatim.
 */
function toBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  let pre: string[] = [];
  const flush = () => {
    if (para.length) {
      blocks.push({ kind: 'p', text: para.join(' ') });
      para = [];
    }
    if (pre.length) {
      blocks.push({ kind: 'pre', text: pre.join('\n') });
      pre = [];
    }
  };
  for (const line of text.split('\n')) {
    if (line.trim() === '') {
      flush();
      continue;
    }
    if (/^\s/.test(line) || /^\d+\s*->/.test(line)) {
      if (para.length) flush();
      pre.push(line.trimEnd());
      continue;
    }
    if (pre.length || /^[-•]\s/.test(line)) flush();
    para.push(line.trim());
  }
  flush();
  return blocks;
}

/** Renders `code` spans. */
function inline(text: string): ReactNode {
  const parts = text.split('`');
  if (parts.length === 1) return text;
  const nodes: ReactNode[] = [];
  let offset = 0;
  for (const part of parts) {
    const isCode = nodes.length % 2 === 1;
    nodes.push(
      isCode ? (
        <code key={offset}>{part}</code>
      ) : (
        <span key={offset}>{part}</span>
      ),
    );
    offset += part.length + 1;
  }
  return nodes;
}

export function Comment({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  if (!text) return null;
  return (
    <div className={clsx(styles.comment, className)}>
      {toBlocks(text).map((block) =>
        block.kind === 'pre' ? (
          <pre key={`pre:${block.text}`}>{block.text}</pre>
        ) : (
          <p key={`p:${block.text}`}>{inline(block.text)}</p>
        ),
      )}
    </div>
  );
}
