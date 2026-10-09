import CodeBlock from '@theme/CodeBlock';
import clsx from 'clsx';
import { useState } from 'react';
import { model, schemaAnchor, shortName } from './api';
import styles from './ApiReference.module.css';
import { Comment } from './Comment';
import { messageExample } from './example';
import { MessageSchema } from './SchemaTable';

type Tab = 'schema' | 'example';

/** A message as a field list or a proto3 JSON example, with a heading. */
export function SchemaOrExample({
  title,
  typeName,
}: {
  title: string;
  typeName: string;
}) {
  const [tab, setTab] = useState<Tab>('schema');
  const message = model.messages[typeName];
  return (
    <section className={styles.block}>
      <div className={styles.blockTitle}>
        <span className={styles.blockLabel}>{title}</span>
        <a className={styles.typeLink} href={`#${schemaAnchor(typeName)}`}>
          {shortName(typeName)}
        </a>
        <span className={styles.tabs} role="tablist">
          {(['schema', 'example'] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              className={clsx(styles.tab, tab === value && styles.tabActive)}
              onClick={() => setTab(value)}
            >
              {value}
            </button>
          ))}
        </span>
      </div>
      {tab === 'schema' ? (
        <>
          <Comment text={message?.comment ?? ''} className={styles.lead} />
          <MessageSchema typeName={typeName} />
        </>
      ) : (
        <CodeBlock language="json">
          {JSON.stringify(messageExample(model, typeName), null, 2)}
        </CodeBlock>
      )}
    </section>
  );
}
