import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { useFallbackUri } from './useFallbackUri';

type Api = ReturnType<typeof useFallbackUri>;

/** Render the hook in a probe; `result.current` tracks the latest value. */
function renderHook(initial: string[]) {
  const result: { current: Api } = { current: null as never };
  function Probe({ uris }: { uris: string[] }) {
    result.current = useFallbackUri(uris);
    return null;
  }
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<Probe uris={initial} />);
  });
  const rerender = (uris: string[]) =>
    act(() => {
      renderer.update(<Probe uris={uris} />);
    });
  return { result, rerender };
}

describe('useFallbackUri', () => {
  it('starts on the first candidate', () => {
    const { result } = renderHook(['a', 'b', 'c']);
    expect(result.current.uri).toBe('a');
  });

  it('advances to the next candidate on error', () => {
    const { result } = renderHook(['a', 'b', 'c']);

    act(() => result.current.onError());
    expect(result.current.uri).toBe('b');

    act(() => result.current.onError());
    expect(result.current.uri).toBe('c');
  });

  it('stays on the last candidate once every one has failed', () => {
    const { result } = renderHook(['a', 'b']);

    act(() => result.current.onError());
    act(() => result.current.onError());
    act(() => result.current.onError());
    expect(result.current.uri).toBe('b');
  });

  it('resets to the first candidate when the list changes', () => {
    const { result, rerender } = renderHook(['a', 'b']);

    act(() => result.current.onError());
    expect(result.current.uri).toBe('b');

    rerender(['x', 'y']);
    expect(result.current.uri).toBe('x');
  });

  it('keeps its position when the same list is passed again', () => {
    const { result, rerender } = renderHook(['a', 'b']);

    act(() => result.current.onError());
    rerender(['a', 'b']);
    expect(result.current.uri).toBe('b');
  });

  it('yields undefined for an empty list', () => {
    const { result } = renderHook([]);
    expect(result.current.uri).toBeUndefined();
    // Erroring on nothing is a no-op, not a crash.
    act(() => result.current.onError());
    expect(result.current.uri).toBeUndefined();
  });
});
