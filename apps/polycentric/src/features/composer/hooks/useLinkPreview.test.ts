import * as React from 'react';
import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { useLinkPreview, type UseLinkPreviewResult } from './useLinkPreview';

// --- Mocks ----------------------------------------------------------------

const mockClient = {
  urlInfo: jest.fn(async () => ({
    url: 'https://example.com',
    title: 't',
    description: 'd',
    image: 'i',
  })),
};

jest.mock('@/src/common/lib/polycentric-hooks', () => ({
  usePolycentric: () => mockClient,
}));

// Controllable per test; reset to enabled in beforeEach (previews on is the
// default most tests assume). `mock`-prefixed so jest's hoisted factory may
// close over it.
let mockLinkPreviewsEnabled = true;
jest.mock('@/src/common/link-previews', () => ({
  useLinkPreviews: () => ({
    enabled: mockLinkPreviewsEnabled,
    setEnabled: jest.fn(),
  }),
}));

jest.mock('@polycentric/react-native', () => ({
  v2: {
    // Metadata + the url we requested; return it verbatim so tests can assert
    // on the resolved `url`.
    Link: { create: jest.fn((x: unknown) => x) },
  },
}));

// parseTextLinks is a dependency-free pure util — exercise the real one so the
// url-detection behavior is covered end to end (mirrors the composer test).

// --- Helpers --------------------------------------------------------------

/** A promise whose resolution we control, to model an in-flight unfurl. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

let renderers: TestRenderer.ReactTestRenderer[] = [];

/**
 * Render the hook with a `text` prop we can update. `result.current` is
 * captured during render (synchronously), so it's always up to date after an
 * `act()` flush; `setText` re-renders the same fiber to preserve hook state.
 */
const renderHook = (initialText = '') => {
  const result: { current: UseLinkPreviewResult } = { current: null as never };
  let renderer!: TestRenderer.ReactTestRenderer;
  function Probe({ text }: { text: string }) {
    result.current = useLinkPreview(text);
    return null;
  }
  act(() => {
    renderer = TestRenderer.create(
      React.createElement(Probe, { text: initialText }),
    );
  });
  renderers.push(renderer);
  const setText = (text: string) =>
    act(() => {
      renderer.update(React.createElement(Probe, { text }));
    });
  return { result, setText };
};

const draftWithUrl = 'check https://example.com out';

beforeEach(() => {
  jest.clearAllMocks();
  mockLinkPreviewsEnabled = true;
});

afterEach(() => {
  act(() => {
    renderers.forEach((r) => {
      r.unmount();
    });
  });
  renderers = [];
});

// --- Tests ----------------------------------------------------------------

describe('useLinkPreview', () => {
  it('resolves a link for the post when enabled and the draft has a url', async () => {
    const { result, setText } = renderHook();
    setText(draftWithUrl);

    let link: unknown;
    await act(async () => {
      link = await result.current.resolveLinkForPost();
    });

    expect(mockClient.urlInfo).toHaveBeenCalledWith('https://example.com');
    expect(link).toMatchObject({ url: 'https://example.com' });
  });

  it('unfurls the target after the debounce and shows the card', async () => {
    jest.useFakeTimers();
    try {
      const { result, setText } = renderHook();
      setText(draftWithUrl);
      // Loading only flips once the debounced fetch actually starts.
      expect(result.current.linkPreviewLoading).toBe(false);

      await act(async () => {
        jest.advanceTimersByTime(1000);
      });
      expect(result.current.linkPreview).toMatchObject({
        url: 'https://example.com',
      });
      expect(result.current.linkPreviewLoading).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  it('reuses the live preview at post time instead of refetching', async () => {
    jest.useFakeTimers();
    try {
      const { result, setText } = renderHook();
      setText(draftWithUrl);
      await act(async () => {
        jest.advanceTimersByTime(1000);
      });
      expect(mockClient.urlInfo).toHaveBeenCalledTimes(1);

      let link: unknown;
      await act(async () => {
        link = await result.current.resolveLinkForPost();
      });
      // Same url already resolved — no second fetch.
      expect(mockClient.urlInfo).toHaveBeenCalledTimes(1);
      expect(link).toMatchObject({ url: 'https://example.com' });
    } finally {
      jest.useRealTimers();
    }
  });

  it('drops the stale card as soon as the url is swapped', async () => {
    jest.useFakeTimers();
    try {
      const { result, setText } = renderHook();
      setText(draftWithUrl);
      await act(async () => {
        jest.advanceTimersByTime(1000);
      });
      expect(result.current.linkPreview).not.toBeNull();

      // Swap the url: the stale card disappears right away, before the new
      // fetch (and its loading state) kicks in.
      setText('now https://other.example instead');
      expect(result.current.linkPreview).toBeNull();
      expect(result.current.linkPreviewLoading).toBe(false);

      await act(async () => {
        jest.advanceTimersByTime(1000);
      });
      expect(result.current.linkPreview).toMatchObject({
        url: 'https://other.example',
      });
      expect(result.current.linkPreviewLoading).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  it('sets loading while the unfurl is in flight and clears it on resolve', async () => {
    jest.useFakeTimers();
    try {
      const unfurl = deferred<Awaited<ReturnType<typeof mockClient.urlInfo>>>();
      mockClient.urlInfo.mockReturnValueOnce(unfurl.promise);
      const { result, setText } = renderHook();
      setText(draftWithUrl);

      // Debounce elapses, the fetch starts: loading is held.
      await act(async () => {
        jest.advanceTimersByTime(1000);
      });
      expect(result.current.linkPreviewLoading).toBe(true);
      expect(result.current.linkPreview).toBeNull();

      await act(async () => {
        unfurl.resolve({
          url: 'https://example.com',
          title: 't',
          description: 'd',
          image: 'i',
        });
      });
      expect(result.current.linkPreviewLoading).toBe(false);
      expect(result.current.linkPreview).toMatchObject({
        url: 'https://example.com',
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('clears the loading state when a loading preview is removed', async () => {
    jest.useFakeTimers();
    try {
      // Never resolves: the caller removes the preview instead of waiting.
      mockClient.urlInfo.mockReturnValueOnce(new Promise(() => {}));
      const { result, setText } = renderHook();
      setText(draftWithUrl);

      await act(async () => {
        jest.advanceTimersByTime(1000);
      });
      expect(result.current.linkPreviewLoading).toBe(true);

      act(() => result.current.handleRemove());
      expect(result.current.linkPreviewLoading).toBe(false);
      expect(result.current.linkPreview).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('revives previews when a different link is typed after dismissal', async () => {
    jest.useFakeTimers();
    try {
      const { result, setText } = renderHook();
      setText(draftWithUrl);
      await act(async () => {
        jest.advanceTimersByTime(1000);
      });
      expect(result.current.linkPreview).not.toBeNull();

      act(() => result.current.handleRemove());
      expect(result.current.linkPreview).toBeNull();

      setText('now https://other.example instead');
      await act(async () => {
        jest.advanceTimersByTime(1000);
      });
      expect(result.current.linkPreview).toMatchObject({
        url: 'https://other.example',
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('revives previews when the same link is deleted and retyped', async () => {
    jest.useFakeTimers();
    try {
      const { result, setText } = renderHook();
      setText(draftWithUrl);
      await act(async () => {
        jest.advanceTimersByTime(1000);
      });
      act(() => result.current.handleRemove());
      expect(result.current.linkPreview).toBeNull();

      // Delete the link and let the draft settle: the removal enters the diff
      // baseline, so retyping the very same url counts as newly typed and
      // unfurls again. (Deleting and retyping within one debounce window
      // coalesces into "no change" — the settled diff never sees it.)
      setText('check  out');
      await act(async () => {
        jest.advanceTimersByTime(1000);
      });
      setText(draftWithUrl);
      await act(async () => {
        jest.advanceTimersByTime(1000);
      });
      expect(result.current.linkPreview).toMatchObject({
        url: 'https://example.com',
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('drops the preview and stops resolving once dismissed', async () => {
    const { result, setText } = renderHook();
    setText(draftWithUrl);

    act(() => result.current.handleRemove());
    expect(result.current.linkPreview).toBeNull();
    expect(result.current.linkPreviewLoading).toBe(false);

    let link: unknown = 'sentinel';
    await act(async () => {
      link = await result.current.resolveLinkForPost();
    });

    expect(mockClient.urlInfo).not.toHaveBeenCalled();
    expect(link).toBeNull();
  });

  it('skips link preview generation when disabled', async () => {
    mockLinkPreviewsEnabled = false;
    const { result, setText } = renderHook();
    setText(draftWithUrl);

    // The disabled setting clears any live preview rather than fetching one.
    expect(result.current.linkPreview).toBeNull();

    let link: unknown = 'sentinel';
    await act(async () => {
      link = await result.current.resolveLinkForPost();
    });

    expect(mockClient.urlInfo).not.toHaveBeenCalled();
    expect(link).toBeNull();
  });

  it('reset clears the current preview and loading state', async () => {
    jest.useFakeTimers();
    try {
      const { result, setText } = renderHook();
      setText(draftWithUrl);
      await act(async () => {
        jest.advanceTimersByTime(1000);
      });
      expect(result.current.linkPreview).not.toBeNull();

      act(() => result.current.reset());
      expect(result.current.linkPreview).toBeNull();
      expect(result.current.linkPreviewLoading).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });
});
