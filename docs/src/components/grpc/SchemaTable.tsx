import type { ApiField, TypeRef } from '@site/plugins/grpc-api/types';
import clsx from 'clsx';
import { type ReactNode, useState } from 'react';
import { model, shortName } from './api';
import styles from './ApiReference.module.css';
import { Comment } from './Comment';

const MAX_DEPTH = 6;

function TypeName({
  type,
  onToggle,
  open,
}: {
  type: TypeRef;
  onToggle?: () => void;
  open?: boolean;
}) {
  if (type.kind === 'scalar') return <>{type.scalar}</>;
  const name = shortName(type.typeName);
  if (!onToggle) return <>{name}</>;
  return (
    <button
      type="button"
      className={clsx(styles.typeButton, open && styles.typeButtonOpen)}
      aria-expanded={open}
      onClick={onToggle}
    >
      {name}
    </button>
  );
}

function FieldType({
  field,
  onToggle,
  open,
}: {
  field: ApiField;
  onToggle?: () => void;
  open?: boolean;
}) {
  const inner = <TypeName type={field.type} onToggle={onToggle} open={open} />;
  if (field.cardinality === 'map') {
    return (
      <>
        map&lt;{field.mapKey}, {inner}&gt;
      </>
    );
  }
  const prefix =
    field.cardinality === 'repeated'
      ? 'repeated '
      : field.cardinality === 'optional'
        ? 'optional '
        : '';
  return (
    <>
      {prefix}
      {inner}
    </>
  );
}

function FieldRow({ field, depth }: { field: ApiField; depth: number }) {
  const [open, setOpen] = useState(false);
  const expandable = field.type.kind !== 'scalar' && depth < MAX_DEPTH;
  return (
    <>
      <div
        className={clsx(
          styles.cell,
          styles.cellName,
          field.oneof && styles.oneofMember,
        )}
        title={`Field number ${field.number}`}
      >
        {field.name}
      </div>
      <div className={clsx(styles.cell, styles.cellType)}>
        <FieldType
          field={field}
          onToggle={expandable ? () => setOpen((value) => !value) : undefined}
          open={open}
        />
      </div>
      <div className={clsx(styles.cell, styles.cellDesc)}>
        <Comment text={field.comment} />
      </div>
      {open && (
        <div className={styles.nested}>
          {field.type.kind === 'message' ? (
            <MessageSchema typeName={field.type.typeName} depth={depth + 1} />
          ) : field.type.kind === 'enum' ? (
            <EnumSchema typeName={field.type.typeName} />
          ) : null}
        </div>
      )}
    </>
  );
}

/** Fields of a message; message and enum types expand in place. */
export function MessageSchema({
  typeName,
  depth = 0,
}: {
  typeName: string;
  depth?: number;
}) {
  const message = model.messages[typeName];
  if (!message) return <p className={styles.empty}>Unknown type {typeName}.</p>;
  if (message.fields.length === 0) {
    return <p className={styles.empty}>No fields.</p>;
  }
  const rows: ReactNode[] = [];
  if (depth === 0) {
    rows.push(
      <div key="header" className={styles.row}>
        <div className={styles.head}>Field</div>
        <div className={styles.head}>Type</div>
        <div className={styles.head}>Description</div>
      </div>,
    );
  }
  const oneofs = new Set<string>();
  for (const field of message.fields) {
    if (field.oneof && !oneofs.has(field.oneof)) {
      oneofs.add(field.oneof);
      rows.push(
        <div key={`oneof:${field.oneof}`} className={styles.oneofLabel}>
          one of ({field.oneof})
        </div>,
      );
    }
    rows.push(<FieldRow key={field.name} field={field} depth={depth} />);
  }
  return <div className={styles.fields}>{rows}</div>;
}

export function EnumSchema({ typeName }: { typeName: string }) {
  const enumType = model.enums[typeName];
  if (!enumType)
    return <p className={styles.empty}>Unknown enum {typeName}.</p>;
  return (
    <div className={styles.fields}>
      {enumType.values.map((value) => (
        <div key={value.name} className={styles.row}>
          <div className={clsx(styles.cell, styles.cellName)}>{value.name}</div>
          <div className={clsx(styles.cell, styles.cellType)}>
            = {value.number}
          </div>
          <div className={clsx(styles.cell, styles.cellDesc)}>
            <Comment text={value.comment} />
          </div>
        </div>
      ))}
    </div>
  );
}
