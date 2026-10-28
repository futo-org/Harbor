import type { ErrorEntry } from '../hooks/useErrorQueue';

export function toErrorEntry(error: unknown, fatal: boolean): ErrorEntry {
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  if (error instanceof Error) {
    return {
      id,
      at: Date.now(),
      name: error.name || 'Error',
      message: error.message,
      stack: error.stack,
      fatal,
    };
  }
  return {
    id,
    at: Date.now(),
    name: 'Error',
    message: String(error ?? 'Unknown error'),
    fatal,
  };
}
