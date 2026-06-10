export interface CreatePolycentricClientConfig {
  databaseName?: string;
  /** gRPC-web URLs the client should start with. */
  seedServers?: string[];
}

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
      // eslint-disable-next-line no-console
      console.warn(
        `[polycentric] dropped ${dropped} log message(s) (backpressure)`,
      );
      dropped = 0;
    }
    if (queue.length === 0) return;
    const batch = queue.splice(0, queue.length).join('\n');
    // eslint-disable-next-line no-console
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
