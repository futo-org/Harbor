import type { LogEntry } from '../hooks/useLogStore';

export function formatLogValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof Error)
    return value.stack ?? `${value.name}: ${value.message}`;
  if (value === undefined) return 'undefined';
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

export function formatLogArgs(args: unknown[]): string {
  return args.map(formatLogValue).join(' ');
}

export function formatLogs(entries: LogEntry[]): string {
  return entries
    .map(
      (entry) =>
        `${new Date(entry.at).toISOString()} [${entry.level.toUpperCase()}] ${entry.message}`,
    )
    .join('\n');
}
