// Structured logging, shaped like the Rust services' tracing JSON (flattened
// event: timestamp, level, target, message, ...fields) so the same VictoriaLogs
// queries work (`target:access`, `level:ERROR`, `latency_ms`). JSON unless
// stdout is a terminal; LOG_FORMAT=json|text overrides, LOG_LEVEL filters.

export type Level = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
export type Fields = Record<string, unknown>;

const LEVELS: Level[] = ['DEBUG', 'INFO', 'WARN', 'ERROR'];

const parseLevel = (value: string | undefined): Level => {
  const upper = value?.toUpperCase();
  return LEVELS.includes(upper as Level) ? (upper as Level) : 'INFO';
};

export type LogSink = (line: string) => void;

export type Logger = {
  debug: (target: string, message: string, fields?: Fields) => void;
  info: (target: string, message: string, fields?: Fields) => void;
  warn: (target: string, message: string, fields?: Fields) => void;
  error: (target: string, message: string, fields?: Fields) => void;
};

// Errors don't JSON.stringify to anything useful; keep the message (and the
// class name when it isn't a plain Error) so `error:*` is queryable.
export const serializeFields = (fields: Fields): Fields => {
  const out: Fields = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value instanceof Error) {
      out[key] = value.message;
      if (value.name !== 'Error') out[`${key}_type`] = value.name;
    } else if (value !== undefined) {
      out[key] = value;
    }
  }
  return out;
};

export const formatJson = (
  level: Level,
  target: string,
  message: string,
  fields: Fields,
): string =>
  JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    target,
    message,
    ...serializeFields(fields),
  });

export const formatText = (
  level: Level,
  target: string,
  message: string,
  fields: Fields,
): string => {
  const extra = Object.entries(serializeFields(fields))
    .map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`)
    .join(' ');
  return `${new Date().toISOString()} ${level.padEnd(5)} ${target}: ${message}${extra ? ` ${extra}` : ''}`;
};

export const createLogger = ({
  format = process.env.LOG_FORMAT ?? (process.stdout.isTTY ? 'text' : 'json'),
  minLevel = parseLevel(process.env.LOG_LEVEL),
  sink = (line: string) => process.stdout.write(`${line}\n`),
}: {
  format?: string;
  minLevel?: Level;
  sink?: LogSink;
} = {}): Logger => {
  const fmt = format === 'text' ? formatText : formatJson;
  const emit =
    (level: Level) =>
    (target: string, message: string, fields: Fields = {}): void => {
      if (LEVELS.indexOf(level) < LEVELS.indexOf(minLevel)) return;
      sink(fmt(level, target, message, fields));
    };
  return {
    debug: emit('DEBUG'),
    info: emit('INFO'),
    warn: emit('WARN'),
    error: emit('ERROR'),
  };
};

export const log = createLogger();

export const hostOf = (url: string): string => {
  try {
    return new URL(url).hostname;
  } catch {
    return 'invalid';
  }
};
