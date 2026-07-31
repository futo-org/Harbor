import { act, render } from '@testing-library/react-native';
import { Image } from './Image';

// expo-image normalizes `source={{ uri }}` into an array of sources, so read
// the first entry's uri to learn which candidate is currently showing.
const shownUri = (node: { props: { source?: { uri?: string }[] } }) =>
  node.props.source?.[0]?.uri;

// Simulate a failed load by invoking the rendered image's onError, the same
// way expo-image calls it on the native side.
const fail = (node: { props: { onError?: (e: unknown) => void } }) =>
  act(() => node.props.onError?.({ nativeEvent: { error: 'boom' } }));

describe('Image', () => {
  it('shows the first candidate', async () => {
    const { getByTestId } = await render(
      <Image testID="img" uris={['a://1', 'b://1']} />,
    );
    expect(shownUri(getByTestId('img'))).toBe('a://1');
  });

  it('falls through to the next candidate when one fails to load', async () => {
    const { getByTestId } = await render(
      <Image testID="img" uris={['a://1', 'b://1']} />,
    );

    await fail(getByTestId('img'));
    expect(shownUri(getByTestId('img'))).toBe('b://1');
  });

  it('stops at the last candidate once all have failed', async () => {
    const { getByTestId } = await render(
      <Image testID="img" uris={['a://1', 'b://1']} />,
    );

    await fail(getByTestId('img'));
    await fail(getByTestId('img'));
    await fail(getByTestId('img'));
    expect(shownUri(getByTestId('img'))).toBe('b://1');
  });

  it('keeps a stable recyclingKey across fallbacks', async () => {
    const { getByTestId } = await render(
      <Image testID="img" uris={['a://1', 'b://1']} />,
    );
    const before = getByTestId('img').props.recyclingKey;

    await fail(getByTestId('img'));
    expect(getByTestId('img').props.recyclingKey).toBe(before);
    expect(before).toBe('a://1');
  });
});
