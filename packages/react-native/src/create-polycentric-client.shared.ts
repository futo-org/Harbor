import {
  type PolycentricClient,
  SyncStrategy,
  type v2Types,
} from '@polycentric/js-core';

/** Options for `createPolycentricClient`, shared by the native and web builds. */
export interface CreatePolycentricClientConfig {
  /**
   * Names the SQLite database (native) or IndexedDB database (web); the blob
   * store uses `${databaseName}-blobs`. Blank or omitted means `polycentric`.
   */
  databaseName?: string;
  /** gRPC-web URLs the client should start with. */
  seedServers?: string[];
  /** Stamped on every event the client builds. */
  application?: v2Types.Application;
}

/** Resolve `databaseName`, treating an omitted or blank name as `polycentric`. */
export function normalizeDatabaseName(databaseName?: string) {
  return (databaseName ?? 'polycentric').trim() || 'polycentric';
}

/**
 * Build a non-blocking log sink for `setLogger`.
 *
 * Every rs-core log crosses the FFI boundary as a synchronous host call.
 * Calling `console.log` inline for each one stalls the JS thread under a
 * burst (RN's `console.log` is slow, worse with a debugger attached), which
 * can freeze the UI. Instead we enqueue messages and flush them in a single
 * batched `console.log` on the next tick, and drop oldest under backpressure
 * so a flood can neither block the caller nor grow unbounded.
 */
export function createBatchingLogSink(maxQueue = 1000): {
  log: (message: string) => void;
} {
  const queue: string[] = [];
  let scheduled = false;
  let dropped = 0;

  const flush = () => {
    scheduled = false;
    if (dropped > 0) {
      console.warn(
        `[polycentric] dropped ${dropped} log message(s) (backpressure)`,
      );
      dropped = 0;
    }
    if (queue.length === 0) return;
    const batch = queue.splice(0, queue.length).join('\n');
    console.log(batch);
  };

  return {
    log: (message: string) => {
      if (queue.length >= maxQueue) {
        dropped++;
        return;
      }
      queue.push(message);
      if (!scheduled) {
        scheduled = true;
        // Defer off the FFI caller so the Rust->JS callback returns
        // immediately; many logs in one tick collapse into one console.log.
        setTimeout(flush, 0);
      }
    },
  };
}

/**
 * Creates and publishes a new identity and sets it as active. Push failures
 * are swallowed, so resolving does not mean the server has it.
 */
export async function createIdentity(
  client: PolycentricClient,
  server: string,
) {
  if (!client.servers.includes(server)) {
    client.servers.push(server);
  }

  const { login, genesisEvent, identityContent, serializedContent } =
    await client.loginManager.beginSignup();

  await client.commitEvent({
    owner: login.identity,
    signedEvent: genesisEvent,
    content: identityContent,
    contentBytes: serializedContent.contentBytes,
  });

  await client.loginManager.finishSignup(login);
  await client.loginAs(login);

  // Push errors are currently swallowed
  await client.sync(SyncStrategy.PARTIAL_PUSH);
}
