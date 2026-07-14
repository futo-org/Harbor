// `@polycentric/react-native`'s barrel pulls in native uniffi init at import
// time, which can't run under jest — expose just what the hook needs.
jest.mock('@polycentric/react-native', () => {
  const aliasResolver = jest.requireActual(
    '../../../../../../packages/js-core/src/http/alias-resolver',
  );
  return {
    normalizeAlias: aliasResolver.normalizeAlias,
    resolveAlias: jest.fn(),
  };
});

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

type ProfileStub = { name: string | null; alias: string | null };
let mockProfiles = new Map<string, ProfileStub>();
jest.mock('@/src/features/profile/hooks/useProfiles', () => ({
  useProfiles: () => mockProfiles,
}));

import { resolveAlias } from '@polycentric/react-native';
import * as React from 'react';
import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import {
  type ProfileSuggestionsResult,
  useProfileSuggestions,
} from './useProfileSuggestions';

const mockResolve = resolveAlias as jest.Mock;

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
  mockResolve.mockReset();
  mockEntries = [];
  mockIsLoading = false;
  mockProfiles = new Map([
    [ALICE, { name: 'Alice', alias: 'alice@example.com' }],
    [BOB, { name: 'Bob', alias: null }],
  ]);
});

afterEach(() => {
  jest.useRealTimers();
});

describe('useProfileSuggestions', () => {
  it('lists everyone followed when the query is empty', () => {
    follows(ALICE, BOB);

    const { result } = renderSuggestions();
    expect(result.current.suggestions).toEqual([
      {
        identity: ALICE,
        name: 'Alice',
        alias: 'alice@example.com',
        source: 'following',
      },
      { identity: BOB, name: 'Bob', alias: null, source: 'following' },
    ]);
  });

  it('matches followed profiles by name, case-insensitively', () => {
    follows(ALICE, BOB);

    const { result } = renderSuggestions('aLi');
    expect(result.current.suggestions.map((s) => s.identity)).toEqual([ALICE]);
  });

  it('matches on alias substring and identity prefix', () => {
    follows(ALICE, BOB);

    const byAlias = renderSuggestions('example.com');
    expect(byAlias.result.current.suggestions.map((s) => s.identity)).toEqual([
      ALICE,
    ]);

    const byPrefix = renderSuggestions('bb22');
    expect(byPrefix.result.current.suggestions.map((s) => s.identity)).toEqual([
      BOB,
    ]);
  });

  it('ignores a leading @ when matching names', () => {
    follows(ALICE, BOB);

    const { result } = renderSuggestions('@alice');
    expect(result.current.suggestions.map((s) => s.identity)).toEqual([ALICE]);
  });

  it('omits excluded identities', () => {
    follows(ALICE, BOB);

    const { result } = renderSuggestions('', { exclude: [ALICE] });
    expect(result.current.suggestions.map((s) => s.identity)).toEqual([BOB]);
  });

  it('offers a pasted identity id directly, deduped against follows', () => {
    follows(ALICE);

    const stranger = 'cd'.repeat(32);
    const pasted = renderSuggestions(stranger.toUpperCase());
    expect(pasted.result.current.suggestions).toEqual([
      { identity: stranger, name: null, alias: null, source: 'identity' },
    ]);

    // Pasting someone already followed yields a single row.
    const followed = renderSuggestions(ALICE);
    expect(followed.result.current.suggestions).toHaveLength(1);
  });

  it('resolves an alias query after the debounce', async () => {
    const stranger = 'ef'.repeat(32);
    mockResolve.mockResolvedValue(stranger);

    const { result } = renderSuggestions('Carol@Example.com');
    expect(result.current.isResolvingAlias).toBe(true);
    expect(result.current.suggestions).toEqual([]);

    await act(async () => {
      jest.advanceTimersByTime(300);
    });

    expect(mockResolve).toHaveBeenCalledWith('carol@example.com');
    expect(result.current.isResolvingAlias).toBe(false);
    expect(result.current.suggestions).toEqual([
      {
        identity: stranger,
        name: null,
        alias: 'carol@example.com',
        source: 'alias',
      },
    ]);
  });

  it('resolves a bare-domain query as a wildcard alias', async () => {
    const stranger = 'ef'.repeat(32);
    mockResolve.mockResolvedValue(stranger);

    const { result } = renderSuggestions('Example.com');
    await act(async () => {
      jest.advanceTimersByTime(300);
    });

    expect(mockResolve).toHaveBeenCalledWith('example.com');
    expect(result.current.suggestions).toEqual([
      {
        identity: stranger,
        name: null,
        alias: 'example.com',
        source: 'alias',
      },
    ]);
  });

  it('shows nothing for an alias that does not resolve', async () => {
    mockResolve.mockResolvedValue(null);

    const { result } = renderSuggestions('nobody@example.com');
    await act(async () => {
      jest.advanceTimersByTime(300);
    });

    expect(result.current.isResolvingAlias).toBe(false);
    expect(result.current.suggestions).toEqual([]);
  });

  it('only resolves the latest alias after typing pauses', async () => {
    mockResolve.mockResolvedValue('ab'.repeat(32));

    const { setQuery } = renderSuggestions('a@example.com');
    await act(async () => {
      jest.advanceTimersByTime(100);
    });
    setQuery('ab@example.com');
    await act(async () => {
      jest.advanceTimersByTime(300);
    });

    expect(mockResolve).toHaveBeenCalledTimes(1);
    expect(mockResolve).toHaveBeenCalledWith('ab@example.com');
  });
});
