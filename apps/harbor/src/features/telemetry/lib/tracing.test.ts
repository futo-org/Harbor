import { SpanStatusCode } from '@opentelemetry/api';
import { InMemorySpanExporter } from '@opentelemetry/sdk-trace';
import { createTracerProvider, recordErrorSpan } from './tracing';

jest.mock('@opentelemetry/exporter-trace-otlp-http', () => ({
  OTLPTraceExporter: jest.fn(),
}));

test('records a error as an error span with the exception and resource', async () => {
  const exporter = new InMemorySpanExporter();
  const provider = createTracerProvider(
    exporter,
    {
      app: 'org.futo.harbor',
      version: '1.2.3',
      build: '45',
      variant: 'staging',
      platform: 'ios',
      osVersion: '18.0',
      device: 'iPhone',
    },
    { 'harbor.identity.key': 'id1', 'harbor.session.signing_key': 'sk1' },
  );

  recordErrorSpan(provider.getTracer('test'), {
    id: 'abc',
    at: Date.UTC(2026, 0, 2),
    name: 'TypeError',
    message: 'nope',
    stack: 'TypeError: nope\n    at somewhere',
    fatal: true,
  });
  await provider.forceFlush();

  const [span] = exporter.getFinishedSpans();
  expect(span?.name).toBe('app.error');
  expect(span?.status.code).toBe(SpanStatusCode.ERROR);
  expect(span?.attributes).toMatchObject({
    'error.type': 'TypeError',
    'harbor.error.fatal': true,
    'harbor.error.id': 'abc',
  });
  expect(span?.events[0]?.name).toBe('exception');
  expect(span?.events[0]?.attributes).toMatchObject({
    'exception.type': 'TypeError',
    'exception.message': 'nope',
    'exception.stacktrace': 'TypeError: nope\n    at somewhere',
  });
  expect(span?.resource.attributes).toMatchObject({
    'service.name': 'harbor',
    'service.version': '1.2.3+45',
    'deployment.environment.name': 'staging',
    'os.name': 'ios',
    'os.version': '18.0',
    'device.model.identifier': 'iPhone',
    'harbor.identity.key': 'id1',
    'harbor.session.signing_key': 'sk1',
  });
});
