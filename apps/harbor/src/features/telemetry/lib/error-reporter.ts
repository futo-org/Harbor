import { isWeb } from '@/src/common/util/platform';
import { type ErrorEntry, useErrorQueue } from '../hooks/useErrorQueue';
import { useTelemetrySettings } from '../hooks/useTelemetrySettings';
import { toErrorEntry } from '../utils/error-entry';
import { emitLog } from './logging';
import { loadPersistedLogs } from '../hooks/useLogStore';
import { formatLogValue } from '../utils/format';
import {
  flushTraces,
  getTracer,
  isTracingConfigured,
  recordErrorSpan,
} from './tracing';

type GlobalHandler = (error: unknown, isFatal?: boolean) => void;

interface ErrorUtilsLike {
  getGlobalHandler: () => GlobalHandler;
  setGlobalHandler: (handler: GlobalHandler) => void;
}

async function send(entry: ErrorEntry): Promise<boolean> {
  const tracer = getTracer();
  if (!tracer) return false;
  recordErrorSpan(tracer, entry);
  const flushed = await flushTraces();
  if (flushed) useErrorQueue.getState().remove(entry.id);
  return flushed;
}

/** Records the error and, when reporting is on, sends it before resolving. */
export function errorReportingActive(): boolean {
  return (
    isTracingConfigured() && useTelemetrySettings.getState().errorReportsEnabled
  );
}

export async function reportError(
  error: unknown,
  fatal: boolean,
): Promise<void> {
  emitLog(
    'error',
    `${fatal ? 'Fatal: ' : 'Unhandled: '}${formatLogValue(error)}`,
  );
  if (!errorReportingActive()) return;
  try {
    const entry = toErrorEntry(error, fatal);
    useErrorQueue.getState().enqueue(entry);
    await send(entry);
  } catch {}
}

/** Sends errors that were queued but not delivered in an earlier session. */
export async function flushQueuedErrorReports(): Promise<void> {
  await useErrorQueue.persist.rehydrate();
  await useTelemetrySettings.persist.rehydrate();
  if (!errorReportingActive()) {
    if (useErrorQueue.getState().entries.length > 0) {
      useErrorQueue.getState().clear();
    }
    return;
  }
  const tracer = getTracer();
  if (!tracer) return;
  const pending = useErrorQueue.getState().entries;
  if (pending.length === 0) return;
  for (const entry of pending) recordErrorSpan(tracer, entry);
  if (await flushTraces()) useErrorQueue.getState().clear();
}

let installed = false;

export function installErrorReporter(): void {
  if (installed) return;
  if (isWeb && typeof window === 'undefined') return;
  installed = true;

  void loadPersistedLogs();
  void flushQueuedErrorReports();

  if (isWeb) {
    window.addEventListener('error', (event) => {
      void reportError(event.error ?? event.message, false);
    });
    window.addEventListener('unhandledrejection', (event) => {
      void reportError(event.reason, false);
    });
    return;
  }

  const errorUtils = (globalThis as { ErrorUtils?: ErrorUtilsLike }).ErrorUtils;
  if (!errorUtils) return;
  const previous = errorUtils.getGlobalHandler();
  errorUtils.setGlobalHandler((error, isFatal) => {
    if (!isFatal || !errorReportingActive()) {
      void reportError(error, !!isFatal);
      previous(error, isFatal);
      return;
    }
    void reportError(error, true).finally(() => previous(error, isFatal));
  });
}
