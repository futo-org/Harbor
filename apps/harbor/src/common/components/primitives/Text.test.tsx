import { render } from '@testing-library/react-native';
import { type StyleProp, StyleSheet, type TextStyle } from 'react-native';
import { twemojiFontFamily } from '@/src/common/assets/twemojiFontFamily';
import { Text } from './Text';

jest.mock('@/src/common/theme', () => {
  const actual = jest.requireActual('@/src/common/theme');
  return {
    ...actual,
    useTheme: () => ({ theme: actual.themes.light }),
  };
});

const emojiRuns = (json: unknown): string[] => {
  const found: string[] = [];
  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    const el = node as {
      props?: { style?: StyleProp<TextStyle> };
      children?: unknown[];
    };
    if (StyleSheet.flatten(el.props?.style)?.fontFamily === twemojiFontFamily) {
      found.push((el.children ?? []).join(''));
      return;
    }
    for (const child of el.children ?? []) walk(child);
  };
  walk(json);
  return found;
};

describe('Text', () => {
  it('renders emoji in the Twemoji font', async () => {
    const { toJSON } = await render(<Text>hi 👋 there 🐈</Text>);
    expect(emojiRuns(toJSON())).toEqual(['👋', '🐈']);
  });

  it('leaves plain text alone', async () => {
    const { toJSON } = await render(<Text>1 + 1 → 2</Text>);
    expect(emojiRuns(toJSON())).toEqual([]);
  });

  it('handles mixed children', async () => {
    const { toJSON } = await render(
      <Text>
        {'a 🐈 '}
        <Text>nested 🎉</Text>
      </Text>,
    );
    expect(emojiRuns(toJSON())).toEqual(['🐈', '🎉']);
  });
});
