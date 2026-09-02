import { createMentionStore, findMentionContext } from './useMentionStore';
import type { ProfileHookResult } from '@/src/features/profile/hooks/useProfile';

const IDENTITY = 'a'.repeat(64);

describe('findMentionContext', () => {
  it('opens after a standalone @ with the query up to the caret', () => {
    expect(findMentionContext('@ab', 3)).toEqual({ start: 0, query: 'ab' });
    expect(findMentionContext('hi @ann smith', 13)).toEqual({
      start: 3,
      query: 'ann smith',
    });
  });

  it('opens with an empty query right after the @', () => {
    expect(findMentionContext('@', 1)).toEqual({ start: 0, query: '' });
    expect(findMentionContext('some @ other', 6)).toEqual({
      start: 5,
      query: '',
    });
  });

  it('tracks only up to the caret, not the rest of the word', () => {
    expect(findMentionContext('@ann', 3)).toEqual({ start: 0, query: 'an' });
  });

  it('is closed at or before the @', () => {
    expect(findMentionContext('@ab', 0)).toBeNull();
  });

  it('is closed when the @ is glued to a preceding word (emails)', () => {
    expect(findMentionContext('a@b', 3)).toBeNull();
  });

  it('is closed when the query starts with a space', () => {
    expect(findMentionContext('email me @ home', 15)).toBeNull();
  });

  it('allows underscores but closes on other non-word chars', () => {
    expect(findMentionContext('@an_n x', 7)).toEqual({
      start: 0,
      query: 'an_n x',
    });
    expect(findMentionContext('@an.', 4)).toBeNull();
    expect(findMentionContext('@an\nx', 5)).toBeNull();
  });

  it('is closed inside an already-recognized alias mention', () => {
    expect(findMentionContext('@ann.example.com', 4)).toBeNull();
  });

  it('is closed inside a recognized identity mention', () => {
    expect(findMentionContext(`@${IDENTITY}`, 5)).toBeNull();
  });

  it('recognizes an alias even after a curly mention (raw offsets)', () => {
    // The curly mention renders shorter than its raw text; the alias check
    // must still line up with the real @ position.
    const text = `@{${IDENTITY},Jane} @user.example.com`;
    const at = text.indexOf('@user');
    expect(findMentionContext(text, at + 5)).toBeNull();
  });
});

describe('insertMention', () => {
  const setup = (text: string, caret: number) => {
    const store = createMentionStore();
    const onChangeText = jest.fn();
    store.setState({
      text,
      selection: { start: caret, end: caret },
      onChangeText,
    });
    return { store, onChangeText };
  };

  const insert = (
    store: ReturnType<typeof createMentionStore>,
    profile: Partial<ProfileHookResult>,
  ) => store.getState().insertMention(IDENTITY, profile as ProfileHookResult);

  it('replaces @query with an alias mention and reuses the following space', () => {
    const { store, onChangeText } = setup('some @an other', 8);
    insert(store, { alias: 'ann.example.com' });

    expect(onChangeText).toHaveBeenCalledWith('some @ann.example.com other');
    // Store stays consistent eagerly: text and caret after the mention.
    const caret = 'some @ann.example.com '.length;
    expect(store.getState().text).toBe('some @ann.example.com other');
    expect(store.getState().selection).toEqual({ start: caret, end: caret });
    expect(store.getState().lastNativeText).toBe(store.getState().text);
  });

  it('mid-word replaces the whole word', () => {
    const { store, onChangeText } = setup('@an rest', 2); // "@a|n rest"
    insert(store, { alias: 'ann.example.com' });
    expect(onChangeText).toHaveBeenCalledWith('@ann.example.com rest');
  });

  it('falls back to the identity form without an alias', () => {
    const { store, onChangeText } = setup('@', 1);
    insert(store, { alias: null });
    expect(onChangeText).toHaveBeenCalledWith(`@${IDENTITY} `);
  });

  it('does nothing when no mention context is open at the caret', () => {
    const { store, onChangeText } = setup('plain text', 5);
    insert(store, { alias: 'ann.example.com' });
    expect(onChangeText).not.toHaveBeenCalled();
    expect(store.getState().text).toBe('plain text');
  });
});
