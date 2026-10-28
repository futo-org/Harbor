import { useErrorQueue } from '../hooks/useErrorQueue';
import { useTelemetrySettings } from '../hooks/useTelemetrySettings';
import { installErrorReporter, reportError } from './error-reporter';

const mockRecordErrorSpan = jest.fn();
const mockFlushTraces = jest.fn<Promise<boolean>, []>();
const mockConfigured = { value: true };

jest.mock('./tracing', () => ({
  createResource: () => ({ attributes: {} }),
  isTracingConfigured: () => mockConfigured.value,
  getTracer: () => ({}),
  recordErrorSpan: (...args: unknown[]) => mockRecordErrorSpan(...args),
  flushTraces: () => mockFlushTraces(),
}));

type Handler = (error: unknown, isFatal?: boolean) => void;

beforeEach(() => {
  useErrorQueue.getState().clear();
  useTelemetrySettings.getState().setErrorReportsEnabled(true);
  mockConfigured.value = true;
  mockRecordErrorSpan.mockReset();
  mockFlushTraces.mockReset().mockResolvedValue(true);
});

test('fatal errors are sent and flushed before the previous handler runs', async () => {
  const previous = jest.fn();
  let current: Handler = previous;
  (globalThis as { ErrorUtils?: unknown }).ErrorUtils = {
    getGlobalHandler: () => current,
    setGlobalHandler: (handler: Handler) => {
      current = handler;
    },
  };

  installErrorReporter();
  const error = new Error('kaboom');
  current(error, true);
  expect(previous).not.toHaveBeenCalled();
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(mockRecordErrorSpan).toHaveBeenCalledTimes(1);
  expect(mockRecordErrorSpan.mock.calls[0]?.[1]).toMatchObject({
    name: 'Error',
    message: 'kaboom',
    fatal: true,
  });
  expect(mockFlushTraces).toHaveBeenCalled();
  expect(previous).toHaveBeenCalledWith(error, true);
  expect(useErrorQueue.getState().entries).toHaveLength(0);
});

test('keeps the entry queued when the flush fails', async () => {
  mockFlushTraces.mockResolvedValue(false);
  await reportError(new Error('later'), false);
  expect(mockRecordErrorSpan).toHaveBeenCalledTimes(1);
  expect(useErrorQueue.getState().entries).toHaveLength(1);
});

test('does nothing when error reports are switched off', async () => {
  useTelemetrySettings.getState().setErrorReportsEnabled(false);
  await reportError(new Error('ignored'), true);
  expect(mockRecordErrorSpan).not.toHaveBeenCalled();
  expect(useErrorQueue.getState().entries).toHaveLength(0);
});

test('does nothing when no endpoint is mockConfigured', async () => {
  mockConfigured.value = false;
  await reportError(new Error('ignored'), true);
  expect(mockRecordErrorSpan).not.toHaveBeenCalled();
});
