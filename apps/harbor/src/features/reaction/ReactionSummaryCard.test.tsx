import type { PostData } from '@/src/common/lib/polycentric-hooks';
import { useTutorialHintsStore } from '@/src/common/lib/useTutorialHintsStore';
import { Context as ThemeContext, themes } from '@/src/common/theme';
import { render } from '@testing-library/react-native';
import { ReactionSummaryCard } from './ReactionSummaryCard';
import type { ReactionGroup } from './usePostReactions';

jest.mock('@/src/common/lib/polycentric-hooks', () => ({
  usePolycentric: () => ({ activeIdentityKey: 'me' }),
  useUsername: (identity: string) =>
    identity.charAt(0).toUpperCase() + identity.slice(1),
}));

describe('ReactionSummaryCard', () => {
  beforeAll(async () => {
    await useTutorialHintsStore.persist.rehydrate();
  });

  beforeEach(() => {
    dismissOpenDetailsHint();
  });

  describe('emoji lines', () => {
    it('names the only reactor', async () => {
      const lines = await renderLines([['👍', 1, ['alice']]]);

      expect(lines).toEqual(['👍 Alice']);
    });

    it('counts the reactors besides the named one', async () => {
      const lines = await renderLines([
        ['👍', 4, ['alice']],
        ['❤️', 2, ['bob']],
      ]);

      expect(lines).toEqual(['👍 Alice and 3 others', '❤️ Bob and 1 other']);
    });

    it('shows the user alone as You', async () => {
      const lines = await renderLines([['👍', 1, ['me']]]);

      expect(lines).toEqual(['👍 You']);
    });

    it('joins You and one reactor with "and"', async () => {
      const lines = await renderLines([['👍', 2, ['me', 'alice']]]);

      expect(lines).toEqual(['👍 You and Alice']);
    });

    it('lists You, a reactor and the rest', async () => {
      const lines = await renderLines([['👍', 14, ['me', 'alice', 'bob']]]);

      expect(lines).toEqual(['👍 You, Alice and 12 others']);
    });

    it('counts unfetched reactors after You', async () => {
      const lines = await renderLines([['👍', 3, ['me']]]);

      expect(lines).toEqual(['👍 You and 2 others']);
    });

    it('counts people when no reactor was fetched', async () => {
      const lines = await renderLines([
        ['👍', 4, []],
        ['❤️', 1, []],
      ]);

      expect(lines).toEqual(['👍 4 people', '❤️ 1 person']);
    });
  });

  describe('last line', () => {
    it('counts hidden reactions and hints at the sheet', async () => {
      showOpenDetailsHint();

      const lines = await renderLines(
        [
          ['👍', 1, ['alice']],
          ['❤️', 4, ['bob']],
          ['😂', 3, ['carol']],
        ],
        1,
      );

      expect(lines.at(-1)).toBe('+7 more reactions · Click to see all');
    });

    it('counts hidden reactions once the hint is dismissed', async () => {
      const lines = await renderLines(
        [
          ['👍', 1, ['alice']],
          ['❤️', 1, ['bob']],
        ],
        1,
      );

      expect(lines).toEqual(['👍 Alice', '+1 more reaction']);
    });

    it('shows only the hint when nothing is hidden', async () => {
      showOpenDetailsHint();

      const lines = await renderLines([['👍', 1, ['alice']]]);

      expect(lines).toEqual(['👍 Alice', 'Click to see all']);
    });

    it('is left out when nothing is hidden and the hint is dismissed', async () => {
      const lines = await renderLines([['👍', 1, ['alice']]]);

      expect(lines).toEqual(['👍 Alice']);
    });
  });
});

function showOpenDetailsHint() {
  useTutorialHintsStore.setState({ dismissedHints: {} });
}

function dismissOpenDetailsHint() {
  useTutorialHintsStore.setState({
    dismissedHints: { openReactionDetails: true },
  });
}

/**
 * Renders the card for a post whose tallies follow `reactions` (emoji, count,
 * fetched reactors) and returns the text of each line, the emoji and the rest
 * separated by a space.
 */
async function renderLines(
  reactions: [emoji: string, count: number, identities: string[]][],
  maxLines = 4,
): Promise<string[]> {
  const post = {
    reactionTallies: reactions.map(([emoji, count]) => ({
      emoji,
      count,
      positive: true,
    })),
  } as unknown as PostData;
  const groups = new Map<string, ReactionGroup>(
    reactions
      .filter(([, , identities]) => identities.length > 0)
      .map(([emoji, , identities]) => [
        emoji,
        {
          emoji,
          reactions: identities.map((identity) => ({ identity, emoji })),
        },
      ]),
  );

  const { toJSON } = await render(
    <ThemeContext.Provider
      value={{
        theme: themes.light,
        themePreference: 'light',
        setThemePreference: () => {},
      }}
    >
      <ReactionSummaryCard post={post} groups={groups} maxLines={maxLines} />
    </ThemeContext.Provider>,
  );

  const card = toJSON() as JsonNode;
  return (card.children ?? []).map((line) =>
    typeof line === 'string' || line.type === 'Text'
      ? textOf(line)
      : (line.children ?? []).map(textOf).join(' '),
  );
}

type JsonNode = { type: string; children: (JsonNode | string)[] | null };

function textOf(node: JsonNode | string): string {
  if (typeof node === 'string') return node;
  return (node.children ?? []).map(textOf).join('');
}
