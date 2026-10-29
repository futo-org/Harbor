import { SeverityNumber } from '@opentelemetry/api';
import { setTelemetryIdentity } from '../lib/identity';
import {
  emitLog,
  getLoggerResource,
  levelOf,
  toLogEntry,
} from '../lib/logging';
import { MAX_LOG_ENTRIES, useLogStore } from './useLogStore';
import { formatLogArgs, formatLogs } from '../utils/format';

jest.mock('@opentelemetry/exporter-trace-otlp-http', () => ({
  OTLPTraceExporter: jest.fn(),
}));

beforeEach(() => {
  useLogStore.getState().clear();
  setTelemetryIdentity({
    identityKey: 'id1',
    signingKey: 'sk1',
    canSign: true,
    canRotate: false,
  });
});

test('emitted records land in the store as OTLP JSON', () => {
  emitLog('warn', 'slow feed', Date.UTC(2026, 0, 2, 3, 4, 5, 6));
  const [entry] = useLogStore.getState().entries;
  expect(entry?.level).toBe('warn');
  expect(entry?.message).toBe('slow feed');
  expect(entry?.at).toBe(Date.UTC(2026, 0, 2, 3, 4, 5, 6));
  expect(entry?.record).toMatchObject({
    timeUnixNano: '1767323045006000000',
    severityNumber: SeverityNumber.WARN,
    severityText: 'WARN',
    body: { stringValue: 'slow feed' },
    attributes: [],
  });
  expect(BigInt(entry?.record.observedTimeUnixNano ?? '0')).toBeGreaterThan(0n);
});

test('puts the identity on the resource', () => {
  expect(getLoggerResource().attributes).toMatchObject({
    'harbor.identity.key': 'id1',
    'harbor.session.signing_key': 'sk1',
    'harbor.session.can_sign': true,
    'harbor.session.can_rotate': false,
  });
  emitLog('info', 'hello');
  expect(useLogStore.getState().entries[0]?.record.attributes).toEqual([]);
});

test('keeps the newest entries up to the cap', () => {
  for (let i = 0; i < MAX_LOG_ENTRIES + 10; i++) emitLog('info', `${i}`, i);
  const { entries } = useLogStore.getState();
  expect(entries).toHaveLength(MAX_LOG_ENTRIES);
  expect(entries.at(-1)?.message).toBe(`${MAX_LOG_ENTRIES + 9}`);
  expect(new Set(entries.map((e) => e.id)).size).toBe(MAX_LOG_ENTRIES);
});

test('maps severity numbers to levels', () => {
  expect(levelOf(SeverityNumber.FATAL)).toBe('error');
  expect(levelOf(SeverityNumber.WARN2)).toBe('warn');
  expect(levelOf(SeverityNumber.INFO)).toBe('info');
  expect(levelOf(SeverityNumber.TRACE)).toBe('debug');
  expect(levelOf(undefined)).toBe('info');
});

test('formats console arguments', () => {
  const error = new Error('boom');
  expect(formatLogArgs(['a', 1, { b: 2 }, undefined, null])).toBe(
    'a 1 {"b":2} undefined null',
  );
  expect(formatLogArgs([error])).toBe(error.stack);
  const circular: Record<string, unknown> = {};
  circular.self = circular;
  expect(formatLogArgs([circular])).toBe('[object Object]');
});

test('formats entries as text', () => {
  emitLog('warn', 'hi', Date.UTC(2026, 0, 2));
  expect(formatLogs(useLogStore.getState().entries)).toBe(
    '2026-01-02T00:00:00.000Z [WARN] hi',
  );
  expect(toLogEntry).toBeDefined();
});
