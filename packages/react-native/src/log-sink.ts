/**
 * A non-blocking log sink for rs-core's `setLogger`.
 *
 * Every rs-core log crosses the FFI as a synchronous host call. Calling
 * `console.log` for each one stalls the JS thread under a burst (RN's
 * `console.log` is slow, worse with a debugger attached), which can freeze
 * the UI. Instead, queue messages and flush them in one batched
 * `console.log` on the next tick, dropping the oldest under backpressure.
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
    console.log(queue.splice(0, queue.length).join('\n'));
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
        setTimeout(flush, 0);
      }
    },
  };
}

export function normalizeDatabaseName(databaseName?: string): string {
  return (databaseName ?? 'polycentric').trim() || 'polycentric';
}
