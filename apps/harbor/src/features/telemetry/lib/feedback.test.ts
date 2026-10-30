import { InMemorySpanExporter } from '@opentelemetry/sdk-trace';
import { emitLog } from './logging';
import { useLogStore } from '../hooks/useLogStore';
import { buildFeedback } from './feedback';
import { createTracerProvider, recordFeedbackSpan } from './tracing';

jest.mock('@opentelemetry/exporter-trace-otlp-http', () => ({
  OTLPTraceExporter: jest.fn(),
}));

const diagnostics = {
  app: 'org.futo.harbor',
  version: '1.2.3',
  build: '45',
  variant: null,
  platform: 'ios',
  osVersion: null,
  device: null,
};

const record = {
  timeUnixNano: '0',
  observedTimeUnixNano: '0',
  severityNumber: 9,
  severityText: 'INFO',
  body: { stringValue: '' },
  attributes: [],
};

beforeEach(() => {
  useLogStore.getState().clear();
});

test('builds feedback honouring the toggles', () => {
  emitLog('info', 'started', 1);
  expect(
    buildFeedback({
      message: '  hello  ',
      email: '  ',
      identityKey: null,
      includeLogs: false,
    }),
  ).toEqual({ message: 'hello' });
  expect(
    buildFeedback({
      message: 'hi',
      email: ' me@example.com ',
      identityKey: 'key1',
      signingKey: 'sk1',
      includeLogs: true,
    }),
  ).toEqual({
    message: 'hi',
    email: 'me@example.com',
    identityKey: 'key1',
    signingKey: 'sk1',
    logs: [
      expect.objectContaining({ at: 1, level: 'info', message: 'started' }),
    ],
  });
});

test('without logs the trace is one span carrying only the feedback', async () => {
  const exporter = new InMemorySpanExporter();
  const provider = createTracerProvider(exporter, diagnostics);
  emitLog('error', 'should not be attached');

  recordFeedbackSpan(
    provider.getTracer('test'),
    buildFeedback({
      message: 'the feed is slow',
      email: '',
      identityKey: 'key1',
      signingKey: 'sk1',
      includeLogs: false,
    }),
  );
  await provider.forceFlush();

  const spans = exporter.getFinishedSpans();
  expect(spans).toHaveLength(1);
  const [span] = spans;
  expect(span?.name).toBe('app.feedback');
  expect(span?.parentSpanContext).toBeUndefined();
  expect(span?.attributes).toEqual({
    'harbor.feedback.message': 'the feed is slow',
    'harbor.identity.key': 'key1',
    'harbor.session.signing_key': 'sk1',
    'harbor.feedback.log_count': 0,
  });
  expect(span?.events).toEqual([]);
  expect(span?.links).toEqual([]);
});

test('records feedback as a span with attributes and log events', async () => {
  const exporter = new InMemorySpanExporter();
  const provider = createTracerProvider(exporter, diagnostics);

  recordFeedbackSpan(provider.getTracer('test'), {
    message: 'the feed is slow',
    email: 'me@example.com',
    identityKey: 'key1',
    signingKey: 'sk1',
    logs: [
      { id: 1, at: 10, level: 'info', message: 'started', record },
      { id: 2, at: 20, level: 'error', message: 'failed', record },
    ],
  });
  await provider.forceFlush();

  const [span] = exporter.getFinishedSpans();
  expect(span?.name).toBe('app.feedback');
  expect(span?.attributes).toEqual({
    'harbor.feedback.message': 'the feed is slow',
    'harbor.feedback.email': 'me@example.com',
    'harbor.identity.key': 'key1',
    'harbor.session.signing_key': 'sk1',
    'harbor.feedback.log_count': 2,
  });
  expect(span?.events.map((e) => [e.name, e.attributes])).toEqual([
    ['log', { 'log.severity': 'info', 'log.message': 'started' }],
    ['log', { 'log.severity': 'error', 'log.message': 'failed' }],
  ]);
  expect(span?.resource.attributes).toMatchObject({
    'service.name': 'harbor',
    'service.version': '1.2.3+45',
  });
});
