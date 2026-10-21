import { fromBinary, fromJson, toBinary, toJson } from '@bufbuild/protobuf';
import type { ApiMethod, ApiService } from '@site/plugins/grpc-api/types';
import CodeBlock from '@theme/CodeBlock';
import clsx from 'clsx';
import { useEffect, useRef, useState } from 'react';
import { model } from './api';
import styles from './ApiReference.module.css';
import { messageExample } from './example';
import { type GrpcWebResult, grpcWebUnary, statusName } from './grpcWeb';
import { getRegistry } from './registry';
import { useSettings } from './settings';

type State =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'failed'; message: string }
  | { kind: 'done'; result: GrpcWebResult; json: string | null };

function initialInput(method: ApiMethod): string {
  return JSON.stringify(messageExample(model, method.input), null, 2);
}

/** Sends a request to the selected server and shows the response. */
export function TryIt({
  service,
  method,
}: {
  service: ApiService;
  method: ApiMethod;
}) {
  const { server, authorization } = useSettings();
  const [input, setInput] = useState(() => initialInput(method));
  const [state, setState] = useState<State>({ kind: 'idle' });
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);

  const path = `${service.typeName}/${method.name}`;
  const url = `${server.replace(/\/+$/, '')}/${path}`;

  async function execute() {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setState({ kind: 'running' });
    try {
      const registry = getRegistry();
      const inputSchema = registry.getMessage(method.input);
      const outputSchema = registry.getMessage(method.output);
      if (!inputSchema || !outputSchema) {
        throw new Error(`Missing descriptors for ${path}`);
      }
      const request = fromJson(inputSchema, JSON.parse(input), { registry });
      const result = await grpcWebUnary({
        baseUrl: server,
        method: path,
        body: toBinary(inputSchema, request),
        authorization: authorization || undefined,
        signal: controller.signal,
      });
      const json = result.payload
        ? JSON.stringify(
            toJson(outputSchema, fromBinary(outputSchema, result.payload), {
              registry,
              useProtoFieldName: true,
              alwaysEmitImplicit: true,
            }),
            null,
            2,
          )
        : null;
      setState({ kind: 'done', result, json });
    } catch (error) {
      if (controller.signal.aborted) return;
      const message = error instanceof Error ? error.message : String(error);
      setState({
        kind: 'failed',
        message:
          error instanceof TypeError && message === 'Failed to fetch'
            ? `Could not reach ${url}. Check the server URL and that the server allows cross-origin requests.`
            : message,
      });
    }
  }

  function cancel() {
    abort.current?.abort();
    abort.current = null;
    setState({ kind: 'idle' });
  }

  return (
    <div className={styles.try}>
      <p className={styles.endpoint}>
        <code>POST {url}</code>
      </p>
      <label className={styles.field}>
        <span>Request body, proto3 JSON</span>
        <textarea
          className={clsx(styles.input, styles.textarea)}
          spellCheck={false}
          value={input}
          onChange={(event) => setInput(event.target.value)}
        />
      </label>
      <div className={styles.actions}>
        <button
          type="button"
          className="button button--primary button--sm"
          disabled={state.kind === 'running' || !server}
          onClick={execute}
        >
          Execute
        </button>
        {state.kind === 'running' ? (
          <button
            type="button"
            className="button button--secondary button--sm"
            onClick={cancel}
          >
            Cancel
          </button>
        ) : (
          <button
            type="button"
            className="button button--secondary button--sm"
            onClick={() => {
              setInput(initialInput(method));
              setState({ kind: 'idle' });
            }}
          >
            Reset
          </button>
        )}
        {state.kind === 'running' && (
          <span className={styles.muted}>Sending…</span>
        )}
      </div>
      {state.kind === 'failed' && (
        <div className={styles.result}>
          <div className={styles.resultMeta}>
            <span className={clsx(styles.status, styles.statusError)}>
              Request failed
            </span>
          </div>
          <pre className={styles.pre}>{state.message}</pre>
        </div>
      )}
      {state.kind === 'done' && (
        <div className={styles.result}>
          <div className={styles.resultMeta}>
            <span
              className={clsx(
                styles.status,
                state.result.status === 0
                  ? styles.statusOk
                  : styles.statusError,
              )}
            >
              {state.result.status} {statusName(state.result.status)}
            </span>
            <span className={styles.muted}>HTTP {state.result.httpStatus}</span>
            <span className={styles.muted}>{state.result.durationMs} ms</span>
            {state.result.payload && (
              <span className={styles.muted}>
                {state.result.payload.length} bytes
              </span>
            )}
          </div>
          {state.result.message && (
            <pre className={styles.pre}>{state.result.message}</pre>
          )}
          {state.json !== null && (
            <CodeBlock language="json" className={styles.response}>
              {state.json}
            </CodeBlock>
          )}
        </div>
      )}
    </div>
  );
}
