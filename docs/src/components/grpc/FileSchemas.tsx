import { model, schemaAnchor, summary } from './api';
import styles from './ApiReference.module.css';
import { Comment } from './Comment';
import { EnumSchema, MessageSchema } from './SchemaTable';

/** Collapsible entries for every message and enum declared in one file. */
export function FileSchemas({ name }: { name: string }) {
  const file = model.files.find((entry) => entry.name === name);
  if (!file) return <p className={styles.empty}>Unknown file {name}.</p>;
  return (
    <div>
      {file.messages.map((typeName) => {
        const message = model.messages[typeName];
        if (!message) return null;
        return (
          <details
            key={typeName}
            id={schemaAnchor(typeName)}
            className={styles.item}
          >
            <summary className={styles.summary}>
              <span className={styles.name}>{message.name}</span>
              <span className={styles.summaryText}>
                {summary(message.comment)}
              </span>
              <span className={styles.chevron} aria-hidden="true" />
            </summary>
            <div className={styles.body}>
              <Comment text={message.comment} className={styles.lead} />
              <MessageSchema typeName={typeName} />
            </div>
          </details>
        );
      })}
      {file.enums.map((typeName) => {
        const enumType = model.enums[typeName];
        if (!enumType) return null;
        return (
          <details
            key={typeName}
            id={schemaAnchor(typeName)}
            className={styles.item}
          >
            <summary className={styles.summary}>
              <span className={styles.name}>{enumType.name}</span>
              <span className={styles.badge}>enum</span>
              <span className={styles.summaryText}>
                {summary(enumType.comment)}
              </span>
              <span className={styles.chevron} aria-hidden="true" />
            </summary>
            <div className={styles.body}>
              <Comment text={enumType.comment} className={styles.lead} />
              <EnumSchema typeName={typeName} />
            </div>
          </details>
        );
      })}
    </div>
  );
}
