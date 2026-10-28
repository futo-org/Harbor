import {
  type AnyValue,
  type HrTime,
  type Logger,
  SeverityNumber,
} from '@opentelemetry/api';
import type { Resource } from '@opentelemetry/resources';
import {
  LoggerProvider,
  type LogRecordProcessor,
  type ReadableLogRecord,
} from '@opentelemetry/sdk-logs';
import { collectDiagnostics } from './diagnostics';
import {
  type AnyValueJson,
  type LogEntry,
  type LogLevel,
  type LogRecordJson,
  useLogStore,
} from '../hooks/useLogStore';
import { onTelemetryIdentityChange, optInIdentityAttributes } from './identity';
import { createResource } from './tracing';

export const LOGGER_NAME = 'harbor';

const SEVERITY: Record<LogLevel, SeverityNumber> = {
  debug: SeverityNumber.DEBUG,
  info: SeverityNumber.INFO,
  warn: SeverityNumber.WARN,
  error: SeverityNumber.ERROR,
};

export function levelOf(severity: SeverityNumber | undefined): LogLevel {
  if (severity === undefined) return 'info';
  if (severity >= SeverityNumber.ERROR) return 'error';
  if (severity >= SeverityNumber.WARN) return 'warn';
  if (severity >= SeverityNumber.INFO) return 'info';
  return 'debug';
}

function hrTimeToNanos(time: HrTime): string {
  return (BigInt(time[0]) * 1_000_000_000n + BigInt(time[1])).toString();
}

function hrTimeToMillis(time: HrTime): number {
  return time[0] * 1000 + Math.floor(time[1] / 1_000_000);
}

function bodyText(body: AnyValue | undefined): string {
  if (typeof body === 'string') return body;
  if (body === undefined || body === null) return '';
  try {
    return JSON.stringify(body) ?? String(body);
  } catch {
    return String(body);
  }
}

export function toAnyValueJson(value: unknown): AnyValueJson {
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { boolValue: value };
  if (typeof value === 'number') {
    return Number.isInteger(value)
      ? { intValue: String(value) }
      : { doubleValue: value };
  }
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(toAnyValueJson) } };
  }
  if (value && typeof value === 'object') {
    return {
      kvlistValue: {
        values: Object.entries(value).map(([key, v]) => ({
          key,
          value: toAnyValueJson(v),
        })),
      },
    };
  }
  return { stringValue: String(value) };
}

export function toLogRecordJson(record: ReadableLogRecord): LogRecordJson {
  const json: LogRecordJson = {
    timeUnixNano: hrTimeToNanos(record.hrTime),
    observedTimeUnixNano: hrTimeToNanos(record.hrTimeObserved),
    severityNumber: record.severityNumber ?? SeverityNumber.UNSPECIFIED,
    severityText: record.severityText ?? '',
    body: { stringValue: bodyText(record.body) },
    attributes: Object.entries(record.attributes).map(([key, value]) => ({
      key,
      value: toAnyValueJson(value),
    })),
  };
  if (record.spanContext) {
    json.traceId = record.spanContext.traceId;
    json.spanId = record.spanContext.spanId;
  }
  return json;
}

export function toLogEntry(record: ReadableLogRecord): Omit<LogEntry, 'id'> {
  const json = toLogRecordJson(record);
  return {
    at: hrTimeToMillis(record.hrTime),
    level: levelOf(record.severityNumber),
    message: json.body.stringValue,
    record: json,
  };
}

/** Keeps every emitted record on the device for the Logs screen. */
export class StoreLogRecordProcessor implements LogRecordProcessor {
  onEmit(record: ReadableLogRecord): void {
    useLogStore.getState().append(toLogEntry(record));
  }
  forceFlush(): Promise<void> {
    return Promise.resolve();
  }
  shutdown(): Promise<void> {
    return Promise.resolve();
  }
}

export function createLoggerProvider(resource: Resource): LoggerProvider {
  return new LoggerProvider({
    resource,
    processors: [new StoreLogRecordProcessor()],
  });
}

let provider: LoggerProvider | null = null;

export function getLoggerResource(): Resource {
  return createResource(collectDiagnostics(), optInIdentityAttributes());
}

export function getLogger(): Logger {
  provider ??= createLoggerProvider(getLoggerResource());
  return provider.getLogger(LOGGER_NAME);
}

onTelemetryIdentityChange(() => {
  const previous = provider;
  provider = null;
  void previous?.shutdown().catch(() => {});
});

export function emitLog(level: LogLevel, message: string, at = Date.now()) {
  getLogger().emit({
    timestamp: at,
    observedTimestamp: Date.now(),
    severityNumber: SEVERITY[level],
    severityText: level.toUpperCase(),
    body: message,
  });
}
