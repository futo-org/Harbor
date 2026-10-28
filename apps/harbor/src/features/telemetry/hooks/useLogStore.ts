import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/** OTLP/JSON `AnyValue`. */
export type AnyValueJson =
  | { stringValue: string }
  | { boolValue: boolean }
  | { intValue: string }
  | { doubleValue: number }
  | { arrayValue: { values: AnyValueJson[] } }
  | { kvlistValue: { values: { key: string; value: AnyValueJson }[] } };

/** OTLP/JSON `LogRecord`, as the collector would receive it. */
export interface LogRecordJson {
  timeUnixNano: string;
  observedTimeUnixNano: string;
  severityNumber: number;
  severityText: string;
  body: { stringValue: string };
  attributes: { key: string; value: AnyValueJson }[];
  traceId?: string;
  spanId?: string;
}

export interface LogEntry {
  id: number;
  at: number;
  level: LogLevel;
  message: string;
  record: LogRecordJson;
}

export type LogInput = Omit<LogEntry, 'id'>;

export const MAX_LOG_ENTRIES = 1000;
const MAX_MESSAGE_LENGTH = 2000;
const STORAGE_KEY = 'polycentric:logs';
const PERSIST_DELAY_MS = 2000;

let persistTimer: ReturnType<typeof setTimeout> | undefined;

export function persistLogs(): Promise<void> {
  clearTimeout(persistTimer);
  persistTimer = undefined;
  return AsyncStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(useLogStore.getState().entries),
  ).catch(() => {});
}

function schedulePersist() {
  if (persistTimer) return;
  persistTimer = setTimeout(() => void persistLogs(), PERSIST_DELAY_MS);
}

interface LogStore {
  entries: LogEntry[];
  append: (entry: LogInput) => void;
  clear: () => void;
}

let nextId = 1;

export const useLogStore = create<LogStore>()((set) => ({
  entries: [],
  append: (entry) => {
    set((state) => ({
      entries: [
        ...state.entries,
        {
          ...entry,
          id: nextId++,
          message: entry.message.slice(0, MAX_MESSAGE_LENGTH),
        },
      ].slice(-MAX_LOG_ENTRIES),
    }));
    schedulePersist();
  },
  clear: () => set({ entries: [] }),
}));

export async function loadPersistedLogs(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const stored = JSON.parse(raw) as LogInput[];
    if (!Array.isArray(stored)) return;
    useLogStore.setState((state) => ({
      entries: [...stored, ...state.entries]
        .slice(-MAX_LOG_ENTRIES)
        .map((entry) => ({ ...entry, id: nextId++ })),
    }));
  } catch {}
}

export function clearLogs() {
  useLogStore.getState().clear();
  void persistLogs();
}
