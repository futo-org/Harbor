import { fireEvent, render } from '@testing-library/react-native';
import { Linking } from 'react-native';
import type { v2 } from '@polycentric/react-native';
import { LinkPreviewCard } from './LinkPreviewCard';

// The card pulls its colors/atoms from the theme; under test we don't render
// the real ThemeProvider (it blocks on font + storage loads), so stub the
// barrel with just what the card touches.
jest.mock('@/src/common/theme', () => ({
  useTheme: () => ({
    theme: {
      palette: { neutral_500: '#888888' },
      atoms: { text_neutral_high: {} },
    },
  }),
  Atoms: new Proxy({}, { get: () => ({}) }),
  withHexOpacity: () => '#88888830',
}));

// Render the themed Text primitive as a plain RN Text so its content is
// queryable without dragging in the primitive's own theming. Uses require()
// inside the factory because jest hoists it above the imports.
jest.mock('@/src/common/components/primitives', () => ({
  Text: ({ children }: { children: unknown }) => {
    const react = require('react');
    const { Text: Native } = require('react-native');
    return react.createElement(Native, null, children);
  },
}));

// The thumbnail is loaded through the server image proxy; capture the call by
// returning a recognizable prefix.
jest.mock('@/src/common/lib/polycentric-hooks', () => ({
  usePolycentric: () => ({
    imageProxyUrls: (url: string) => [`proxy://${url}`],
  }),
}));

const makeLink = (overrides: Partial<v2.Link> = {}): v2.Link =>
  ({
    url: 'https://example.com/path',
    title: '',
    description: '',
    image: '',
    ...overrides,
  }) as v2.Link;

describe('LinkPreviewCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the host, title, and description', async () => {
    const { queryByText } = await render(
      <LinkPreviewCard
        link={makeLink({ title: 'My Title', description: 'My description' })}
      />,
    );

    // Host is derived from the URL, not the raw URL.
    expect(queryByText('example.com')).not.toBeNull();
    expect(queryByText('My Title')).not.toBeNull();
    expect(queryByText('My description')).not.toBeNull();
  });

  it('falls back to the raw url when it does not parse', async () => {
    const { queryByText } = await render(
      <LinkPreviewCard link={makeLink({ url: 'not a url' })} />,
    );
    expect(queryByText('not a url')).not.toBeNull();
  });

  it('loads the thumbnail through the image proxy', async () => {
    const { getByTestId } = await render(
      <LinkPreviewCard link={makeLink({ image: 'https://img.test/x.png' })} />,
    );
    // The raw image URL is rewritten through the proxy, not hotlinked.
    // expo-image normalizes `source={{ uri }}` into an array of sources.
    expect(getByTestId('linkPreviewImage').props.source[0].uri).toBe(
      'proxy://https://img.test/x.png',
    );
  });

  it('renders no image and only the host line when optional fields are empty', async () => {
    const { queryByTestId, queryAllByText } = await render(
      <LinkPreviewCard link={makeLink()} />,
    );
    expect(queryByTestId('linkPreviewImage')).toBeNull();
    // Title/description are omitted, leaving just the host text.
    expect(queryAllByText(/.+/)).toHaveLength(1);
  });

  it('opens the url when pressed', async () => {
    const openURL = jest
      .spyOn(Linking, 'openURL')
      .mockResolvedValue(true as never);
    const { getByText } = await render(
      <LinkPreviewCard link={makeLink({ url: 'https://example.com/path' })} />,
    );

    // Press the card via its host text; the tap bubbles to the card's handler.
    await fireEvent.press(getByText('example.com'));
    expect(openURL).toHaveBeenCalledWith('https://example.com/path');
  });
});
