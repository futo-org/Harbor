import { MAX_QUEUED_ERRORS, useErrorQueue } from './useErrorQueue';
import { toErrorEntry } from '../utils/error-entry';

beforeEach(() => {
  useErrorQueue.getState().clear();
});

test('keeps the newest entries and caps the queue', () => {
  const { enqueue } = useErrorQueue.getState();
  for (let i = 0; i < MAX_QUEUED_ERRORS + 5; i++) {
    enqueue({ id: `${i}`, at: i, name: 'Error', message: `${i}`, fatal: true });
  }
  const { entries } = useErrorQueue.getState();
  expect(entries).toHaveLength(MAX_QUEUED_ERRORS);
  expect(entries.at(-1)?.id).toBe(`${MAX_QUEUED_ERRORS + 4}`);
});

test('removes a single entry by id', () => {
  const { enqueue, remove } = useErrorQueue.getState();
  enqueue({ id: 'a', at: 1, name: 'Error', message: 'a', fatal: false });
  enqueue({ id: 'b', at: 2, name: 'Error', message: 'b', fatal: false });
  remove('a');
  expect(useErrorQueue.getState().entries.map((e) => e.id)).toEqual(['b']);
});

test('converts errors and plain values into entries', () => {
  const fromError = toErrorEntry(new TypeError('nope'), true);
  expect(fromError.name).toBe('TypeError');
  expect(fromError.message).toBe('nope');
  expect(fromError.stack).toContain('nope');
  expect(fromError.fatal).toBe(true);

  const fromString = toErrorEntry('plain', false);
  expect(fromString.name).toBe('Error');
  expect(fromString.message).toBe('plain');
  expect(fromString.stack).toBeUndefined();
});
