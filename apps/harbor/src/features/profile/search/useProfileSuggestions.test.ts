jest.mock('@/src/common/lib/polycentric-hooks', () => ({
  useCurrentIdentity: () => ({ identityKey: 'me' }),
}));

let mockEntries: { identity: string; createdAt: bigint }[] = [];
let mockIsLoading = false;
jest.mock('@/src/features/follow/hooks/useFollowList', () => ({
  useFollowList: () => ({
    entries: mockEntries,
    isLoading: mockIsLoading,
    error: null,
    hasMore: false,
    loadMore: jest.fn(),
    refresh: jest.fn(),
  }),
}));

let mockSearchEntries: { identity: string }[] = [];
let mockSearchLoading = false;
let lastSearchQuery: string | null = null;
jest.mock('@/src/features/search/hooks/useSearchUsers', () => ({
  useSearchUsers: (query: string) => {
    lastSearchQuery = query;
    return {
      entries: query ? mockSearchEntries : [],
      isLoading: mockSearchLoading,
      isRefreshing: false,
      error: null,
      hasMore: false,
      loadMore: jest.fn(),
      refresh: jest.fn(),
    };
  },
}));

import * as React from 'react';
import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import {
  type ProfileSuggestionsResult,
  useProfileSuggestions,
} from './useProfileSuggestions';

const ALICE = 'aa11'.repeat(16);
const BOB = 'bb22'.repeat(16);

function follows(...identities: string[]) {
  mockEntries = identities.map((identity, i) => ({
    identity,
    createdAt: BigInt(i),
  }));
}

function renderSuggestions(
  initialQuery = '',
  opts?: { exclude?: readonly string[] },
) {
  const result: { current: ProfileSuggestionsResult } = {
    current: null as never,
  };
  function Probe({ query }: { query: string }) {
    result.current = useProfileSuggestions(query, opts);
    return null;
  }
  let root: TestRenderer.ReactTestRenderer;
  act(() => {
    root = TestRenderer.create(
      React.createElement(Probe, { query: initialQuery }),
    );
  });
  const setQuery = (query: string) =>
    act(() => root.update(React.createElement(Probe, { query })));
  return { result, setQuery };
}

beforeEach(() => {
  jest.useFakeTimers();
  mockEntries = [];
  mockIsLoading = false;
  mockSearchEntries = [];
  mockSearchLoading = false;
  lastSearchQuery = null;
});

afterEach(() => {
  jest.useRealTimers();
});

describe('useProfileSuggestions', () => {
  it('lists everyone followed when the query is empty', () => {
    follows(ALICE, BOB);

    const { result } = renderSuggestions();
    expect(result.current.suggestions).toEqual([
      { identity: ALICE, source: 'following' },
      { identity: BOB, source: 'following' },
    ]);
  });

  it('returns user search results for a query', () => {
    follows(ALICE);
    mockSearchEntries = [{ identity: BOB }];

    const { result } = renderSuggestions('bob');
    expect(lastSearchQuery).toBe('bob');
    expect(result.current.suggestions).toEqual([
      { identity: BOB, source: 'search' },
    ]);
  });

  it('waits for a typing pause before searching a changed query', async () => {
    const { setQuery } = renderSuggestions('bo');

    setQuery('bob');
    expect(lastSearchQuery).toBe('bo');

    await act(async () => {
      jest.advanceTimersByTime(300);
    });
    expect(lastSearchQuery).toBe('bob');
  });

  it('reports searching while the pause or request is pending', async () => {
    const { result, setQuery } = renderSuggestions('bo');
    expect(result.current.isSearching).toBe(false);

    setQuery('bob');
    expect(result.current.isSearching).toBe(true);

    await act(async () => {
      jest.advanceTimersByTime(300);
    });
    expect(result.current.isSearching).toBe(false);
  });

  it('omits excluded identities', () => {
    follows(ALICE, BOB);

    const { result } = renderSuggestions('', { exclude: [ALICE] });
    expect(result.current.suggestions.map((s) => s.identity)).toEqual([BOB]);

    mockSearchEntries = [{ identity: ALICE }, { identity: BOB }];
    const searched = renderSuggestions('b', { exclude: [ALICE] });
    expect(searched.result.current.suggestions.map((s) => s.identity)).toEqual([
      BOB,
    ]);
  });
});
