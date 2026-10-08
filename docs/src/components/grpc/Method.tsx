import type { ApiMethod } from '@site/plugins/grpc-api/types';
import { useState } from 'react';
import { fileBasename, model } from './api';
import styles from './ApiReference.module.css';
import { Comment } from './Comment';
import { SchemaOrExample } from './SchemaOrExample';
import { TryIt } from './TryIt';

function streamingLabel(method: ApiMethod): string | null {
  if (method.clientStreaming && method.serverStreaming) return 'bidi streaming';
  if (method.clientStreaming) return 'client streaming';
  if (method.serverStreaming) return 'server streaming';
  return null;
}

/** The comment of a service, under its heading. */
export function ServiceIntro({ name }: { name: string }) {
  const service = model.services.find((entry) => entry.name === name);
  if (!service) return null;
  return (
    <div className={styles.serviceIntro}>
      <Comment text={service.comment} />
      <p className={styles.fileName}>
        {service.typeName} in {fileBasename(service.file)}
      </p>
    </div>
  );
}

/** One method: description, endpoint, request, response and Try it out. */
export function Method({
  service: serviceName,
  name,
}: {
  service: string;
  name: string;
}) {
  const service = model.services.find((entry) => entry.name === serviceName);
  const method = service?.methods.find((entry) => entry.name === name);
  const [tryOpen, setTryOpen] = useState(false);
  if (!service || !method) {
    return (
      <p className={styles.empty}>
        Unknown method {serviceName}.{name}.
      </p>
    );
  }
  const streaming = streamingLabel(method);
  return (
    <div className={styles.method}>
      <Comment text={method.comment} className={styles.lead} />
      <p className={styles.endpoint}>
        <code>
          POST /{service.typeName}/{method.name}
        </code>
        {streaming && <span className={styles.badge}>{streaming}</span>}
      </p>
      <SchemaOrExample title="Request" typeName={method.input} />
      <SchemaOrExample title="Response" typeName={method.output} />
      <div className={styles.tryHeader}>
        <span className={styles.blockLabel}>Try it out</span>
        {streaming ? (
          <span className={styles.muted}>
            Streaming methods cannot be called from this page.
          </span>
        ) : (
          <button
            type="button"
            className={`button button--sm ${tryOpen ? 'button--secondary' : 'button--primary'}`}
            onClick={() => setTryOpen((value) => !value)}
          >
            {tryOpen ? 'Close' : 'Try it out'}
          </button>
        )}
      </div>
      {tryOpen && !streaming && <TryIt service={service} method={method} />}
    </div>
  );
}
