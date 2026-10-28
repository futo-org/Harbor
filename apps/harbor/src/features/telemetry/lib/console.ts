import { isWeb } from '@/src/common/util/platform';
import { emitLog } from './logging';
import type { LogLevel } from '../hooks/useLogStore';
import { formatLogArgs } from '../utils/format';

const CONSOLE_LEVELS: Record<
  'debug' | 'log' | 'info' | 'warn' | 'error',
  LogLevel
> = {
  debug: 'debug',
  log: 'info',
  info: 'info',
  warn: 'warn',
  error: 'error',
};

let installed = false;

export function installConsoleCapture(): void {
  if (installed) return;
  if (isWeb && typeof window === 'undefined') return;
  installed = true;
  for (const [method, level] of Object.entries(CONSOLE_LEVELS) as [
    keyof typeof CONSOLE_LEVELS,
    LogLevel,
  ][]) {
    const original = console[method].bind(console);
    console[method] = (...args: unknown[]) => {
      try {
        emitLog(level, formatLogArgs(args));
      } catch {}
      original(...args);
    };
  }
}
