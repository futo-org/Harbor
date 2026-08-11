import * as React from 'react';
import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { useDebouncedValue } from './useDebouncedValue';

jest.useFakeTimers();

function renderHook(initial: string, delayMs?: number) {
  const result: { current: string } = { current: '' };
  let setValue: (v: string) => void = () => {};
  function Probe() {
    const [value, set] = React.useState(initial);
    setValue = set;
    result.current = useDebouncedValue(value, delayMs);
    return null;
  }
  act(() => {
    TestRenderer.create(React.createElement(Probe));
  });
  return {
    result,
    set: (v: string) => act(() => setValue(v)),
    advance: (ms: number) => act(() => jest.advanceTimersByTime(ms)),
  };
}

describe('useDebouncedValue', () => {
  it('returns the initial value immediately', () => {
    const { result } = renderHook('hello');
    expect(result.current).toBe('hello');
  });

  it('holds the previous value until the delay elapses', () => {
    const { result, set, advance } = renderHook('a');
    set('ab');
    expect(result.current).toBe('a');
    advance(299);
    expect(result.current).toBe('a');
    advance(1);
    expect(result.current).toBe('ab');
  });

  it('collapses rapid updates to the last value', () => {
    const { result, set, advance } = renderHook('a');
    set('ab');
    advance(200);
    set('abc');
    advance(200);
    set('abcd');
    expect(result.current).toBe('a');
    advance(300);
    expect(result.current).toBe('abcd');
  });

  it('respects a custom delay', () => {
    const { result, set, advance } = renderHook('a', 1000);
    set('ab');
    advance(300);
    expect(result.current).toBe('a');
    advance(700);
    expect(result.current).toBe('ab');
  });
});
