import {
  createMentionStore,
  findMentionContext,
  selectMentionQuery,
} from './useMentionStore';
import type { ProfileHookResult } from '@/src/features/profile/hooks/useProfile';
import { useComposerStore } from './useComposerStore';
import { applyTextChange } from '../utils/applyTextChange';

const IDENTITY = 'a'.repeat(64);

describe('findMentionContext', () => {
  it('opens after a standalone @ with the query up to the caret', () => {
    expect(findMentionContext('@ab', 3, [])).toEqual({ start: 0, query: 'ab' });
    expect(findMentionContext('hi @ann smith', 13, [])).toEqual({
      start: 3,
      query: 'ann smith',
    });
  });

  it('opens with an empty query right after the @', () => {
    expect(findMentionContext('@', 1, [])).toEqual({ start: 0, query: '' });
    expect(findMentionContext('some @ other', 6, [])).toEqual({
      start: 5,
      query: '',
    });
  });

  it('is open only when the caret is followed by a space, newline or the end', () => {
    expect(findMentionContext('@an', 3, [])).toEqual({ start: 0, query: 'an' });
    expect(findMentionContext('@an x', 3, [])).toEqual({
      start: 0,
      query: 'an',
    });
    expect(findMentionContext('@an\nx', 3, [])).toEqual({
      start: 0,
      query: 'an',
    });
    expect(findMentionContext('@ann', 3, [])).toBeNull();
    expect(findMentionContext('@an.', 3, [])).toBeNull();
    expect(findMentionContext('@an,', 3, [])).toBeNull();
    // Would otherwise never close: inserting leaves the caret before the dot.
    expect(findMentionContext('@some.other.', 11, [])).toBeNull();
  });

  it('is closed at or before the @', () => {
    expect(findMentionContext('@ab', 0, [])).toBeNull();
  });

  it('is closed when the @ is glued to a preceding word (emails)', () => {
    expect(findMentionContext('a@b', 3, [])).toBeNull();
    expect(findMentionContext('foo bar@dom', 11, [])).toBeNull();
  });

  it('is closed when the query starts with a space', () => {
    expect(findMentionContext('email me @ home', 15, [])).toBeNull();
  });

  it('name-like: word chars with at most one space', () => {
    expect(findMentionContext('@an_n x', 7, [])).toEqual({
      start: 0,
      query: 'an_n x',
    });
    expect(findMentionContext('@ann ', 5, [])).toEqual({
      start: 0,
      query: 'ann ',
    });
    expect(findMentionContext('@ann smith x', 12, [])).toBeNull();
    expect(findMentionContext('@an\nx', 5, [])).toBeNull();
    // A second @ after the space is an email following a mention.
    expect(findMentionContext('@ann foo@dom', 12, [])).toBeNull();
  });

  it('alias-like: dots and one glued @, no spaces', () => {
    expect(findMentionContext('@some.', 6, [])).toEqual({
      start: 0,
      query: 'some.',
    });
    expect(findMentionContext('@domain.com', 11, [])).toEqual({
      start: 0,
      query: 'domain.com',
    });
    expect(findMentionContext('@user@', 6, [])).toEqual({
      start: 0,
      query: 'user@',
    });
    expect(findMentionContext('hi @user@domain.com', 19, [])).toEqual({
      start: 3,
      query: 'user@domain.com',
    });
    expect(findMentionContext('@a@b@c', 6, [])).toBeNull();
    expect(findMentionContext('@@foo', 5, [])).toBeNull();
    expect(findMentionContext('@some. ', 7, [])).toBeNull();
    expect(findMentionContext('@some. x', 8, [])).toBeNull();
    expect(findMentionContext('@user@dom smith', 15, [])).toBeNull();
    // Post-insert state: alias plus the trailing space.
    expect(findMentionContext('@ann.example.com ', 17, [])).toBeNull();
  });

  it('is closed after an inserted mention', () => {
    const range = { start: 0, end: 4, identity: IDENTITY };
    expect(findMentionContext('@Ann ', 5, [])).toEqual({
      start: 0,
      query: 'Ann ',
    });
    expect(findMentionContext('@Ann ', 5, [range])).toBeNull();
  });

  it('is closed with the caret right after an inserted mention, typing on included', () => {
    // An inserted `@Name`, also a valid query for someone like `Namesuffix`
    const range = { start: 3, end: 8, identity: IDENTITY };
    expect(findMentionContext('hi @Name rest', 8, [])).toEqual({
      start: 3,
      query: 'Name',
    });
    expect(findMentionContext('hi @Name rest', 8, [range])).toBeNull();
    expect(findMentionContext('hi @Name', 8, [range])).toBeNull();

    // Typing at its end keeps the mention, followed by plain text
    const typed = applyTextChange('hi @Name rest', 'hi @Names rest', [range]);
    expect(typed.mentionRanges).toEqual([range]);
    expect(
      findMentionContext(typed.text, typed.caret, typed.mentionRanges),
    ).toBeNull();
  });

  it('opens for a new @ after an inserted mention', () => {
    const range = { start: 3, end: 8, identity: IDENTITY };
    expect(findMentionContext('hi @Name @Na', 12, [range])).toEqual({
      start: 9,
      query: 'Na',
    });
  });

  it('finds the right @ after a curly mention (raw offsets)', () => {
    // The curly mention renders shorter than its raw text; offsets must line
    // up with the real @ position.
    const text = `@{${IDENTITY},Jane} @user.example.com`;
    const at = text.indexOf('@user');
    expect(findMentionContext(text, text.length, [])).toEqual({
      start: at,
      query: 'user.example.com',
    });
  });
});

describe('insertMention', () => {
  const setup = (text: string, caret: number) => {
    // A fresh draft, which holds the inserted mention ranges
    useComposerStore.getState().reset();
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

  // Aliases with and without an account name behave identically.
  it.each(['ann.example.com', 'ann@example.com'])(
    'replaces @query with the alias %s and reuses the following space',
    (alias) => {
      const { store, onChangeText } = setup('some @an other', 8);
      insert(store, { alias });

      // Store stays consistent eagerly: text and caret after the mention.
      const caret = `some @${alias} `.length;
      expect(onChangeText).toHaveBeenCalledWith(`some @${alias} other`, caret);
      expect(store.getState().text).toBe(`some @${alias} other`);
      expect(store.getState().selection).toEqual({ start: caret, end: caret });
    },
  );

  it('adds a space before a following newline', () => {
    const { store, onChangeText } = setup('@an\nrest', 3);
    insert(store, { alias: 'ann.example.com' });
    expect(onChangeText).toHaveBeenCalledWith('@ann.example.com \nrest', 17);
  });

  it('leaves the store closed after every insert', () => {
    for (const [text, caret, alias] of [
      ['@an', 2, 'ann.example.com'],
      ['@an rest', 2, 'ann.example.com'],
      ['@an\nrest', 2, 'ann.example.com'],
      ['@an', 2, 'ann@example.com'],
      ['@an rest', 2, 'ann@example.com'],
      ['@an\nrest', 2, 'ann@example.com'],
      ['@', 1, null],
    ] as const) {
      const { store } = setup(text, caret);
      insert(store, { alias });
      store.setState({ isFocused: true });
      expect(selectMentionQuery(store.getState())).toBeNull();
    }
    // A one-word name plus the space is still a name-like query.
    for (const [text, caret] of [
      ['@an', 2],
      ['@an rest', 2],
    ] as const) {
      const { store } = setup(text, caret);
      insert(store, { alias: null, name: 'Ann' });
      store.setState({ isFocused: true });
      expect(selectMentionQuery(store.getState())).toBeNull();
    }
  });

  it('falls back to the display name, then the identity, without an alias', () => {
    const named = setup('@', 1);
    insert(named.store, { alias: null, name: 'Ann Smith' });
    expect(named.onChangeText).toHaveBeenCalledWith('@Ann Smith ', 11);
    const unnamed = setup('@', 1);
    insert(unnamed.store, { alias: null, name: null });
    expect(unnamed.onChangeText).toHaveBeenCalledWith(
      `@${IDENTITY} `,
      IDENTITY.length + 2,
    );
  });

  it('does nothing when no mention context is open at the caret', () => {
    const { store, onChangeText } = setup('plain text', 5);
    insert(store, { alias: 'ann.example.com' });
    expect(onChangeText).not.toHaveBeenCalled();
    expect(store.getState().text).toBe('plain text');
  });

  describe('mention ranges', () => {
    it.each([
      [{ alias: 'ann.example.com', name: 'Ann' }, '@ann.example.com'],
      [{ alias: 'ann@example.com', name: 'Ann' }, '@ann@example.com'],
      [{ alias: null, name: 'Ann Smith' }, '@Ann Smith'],
      [{ alias: null, name: null }, `@${IDENTITY}`],
    ])('records the inserted %o as a range', (profile, mention) => {
      const { store } = setup('hi @an', 6);
      insert(store, profile);
      const range = { start: 3, end: 3 + mention.length, identity: IDENTITY };
      expect(useComposerStore.getState().mentionRanges).toEqual([range]);
      expect(store.getState().mentionRanges).toEqual([range]);
    });

    it('records nothing on a failed insert', () => {
      const { store } = setup('plain text', 5);
      insert(store, { alias: 'ann.example.com' });
      expect(useComposerStore.getState().mentionRanges).toEqual([]);
    });
  });
});
