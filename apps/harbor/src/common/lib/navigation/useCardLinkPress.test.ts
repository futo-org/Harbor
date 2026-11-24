let mockIsWeb = true;
jest.mock('@/src/common/util/platform', () => ({
  get isWeb() {
    return mockIsWeb;
  },
}));

const mockNavigate = jest.fn();
jest.mock('expo-router', () => ({
  router: { navigate: (...args: unknown[]) => mockNavigate(...args) },
  Link: { resolveHref: (href: string) => href },
}));

import { renderHook } from '@testing-library/react-native';
import type { ComponentRef } from 'react';
import type { GestureResponderEvent, View } from 'react-native';
import { useCardLinkPress } from './useCardLinkPress';

const POST_PATH = '/alice/post/1';
const mockOpen = jest.fn();

beforeEach(() => {
  mockIsWeb = true;
  mockNavigate.mockClear();
  mockOpen.mockClear();
  window.open = mockOpen;
});

test('a plain click navigates to the destination', async () => {
  const { result } = await renderHook(() => useCardLinkPress(POST_PATH));

  result.current.onPress(buildPressEvent());

  expect(mockNavigate).toHaveBeenCalledWith(POST_PATH);
  expect(mockOpen).not.toHaveBeenCalled();
});

test('a plain click runs onPress, then navigates', async () => {
  const calls: string[] = [];
  const onPress = jest.fn(() => calls.push('onPress'));
  mockNavigate.mockImplementationOnce(() => calls.push('navigate'));
  const { result } = await renderHook(() =>
    useCardLinkPress(POST_PATH, onPress),
  );

  result.current.onPress(buildPressEvent());

  expect(calls).toEqual(['onPress', 'navigate']);
  expect(mockNavigate).toHaveBeenCalledWith(POST_PATH);
});

test.each([
  ['Cmd', { metaKey: true }],
  ['Ctrl', { ctrlKey: true }],
])('a %s-click opens the destination in a new tab', async (_, modifiers) => {
  const onPress = jest.fn();
  const { result } = await renderHook(() =>
    useCardLinkPress(POST_PATH, onPress),
  );

  result.current.onPress(buildPressEvent(modifiers));

  expect(mockOpen).toHaveBeenCalledWith(POST_PATH, '_blank');
  expect(onPress).not.toHaveBeenCalled();
  expect(mockNavigate).not.toHaveBeenCalled();
});

test('a middle-click on the card opens the destination in a new tab', async () => {
  const { result } = await renderHook(() => useCardLinkPress(POST_PATH));
  const card = buildCard();
  result.current.ref(card.view);

  const mouseDown = card.dispatch('mousedown', 1, card.element);
  card.dispatch('auxclick', 1, card.element);

  expect(mouseDown.preventDefault).toHaveBeenCalled();
  expect(mockOpen).toHaveBeenCalledWith(POST_PATH, '_blank');
});

test('a middle-click on a control inside the card is left to it', async () => {
  const { result } = await renderHook(() => useCardLinkPress(POST_PATH));
  const card = buildCard();
  result.current.ref(card.view);

  const mouseDown = card.dispatch('mousedown', 1, card.innerControl);
  card.dispatch('auxclick', 1, card.innerControl);

  expect(mouseDown.preventDefault).not.toHaveBeenCalled();
  expect(mockOpen).not.toHaveBeenCalled();
});

test('the ref cleanup removes the middle-click listeners', async () => {
  const { result } = await renderHook(() => useCardLinkPress(POST_PATH));
  const card = buildCard();
  const cleanup = result.current.ref(card.view);

  cleanup?.();
  card.dispatch('auxclick', 1, card.element);

  expect(mockOpen).not.toHaveBeenCalled();
});

test('without a destination, a click only runs onPress', async () => {
  const onPress = jest.fn();
  const { result } = await renderHook(() =>
    useCardLinkPress(undefined, onPress),
  );
  const card = buildCard();
  result.current.ref(card.view);

  result.current.onPress(buildPressEvent({ metaKey: true }));
  card.dispatch('auxclick', 1, card.element);

  expect(onPress).toHaveBeenCalled();
  expect(mockOpen).not.toHaveBeenCalled();
  expect(mockNavigate).not.toHaveBeenCalled();
});

test('on native, modifiers are ignored and no listeners are added', async () => {
  mockIsWeb = false;
  const { result } = await renderHook(() => useCardLinkPress(POST_PATH));
  const card = buildCard();
  result.current.ref(card.view);

  result.current.onPress(buildPressEvent({ metaKey: true }));

  expect(mockNavigate).toHaveBeenCalledWith(POST_PATH);
  expect(mockOpen).not.toHaveBeenCalled();
  expect(card.listenerCount()).toBe(0);
});

function buildPressEvent(
  modifiers: { metaKey?: boolean; ctrlKey?: boolean } = {},
) {
  return {
    nativeEvent: { metaKey: false, ctrlKey: false, ...modifiers },
  } as unknown as GestureResponderEvent;
}

/**
 * A stand-in for the card's DOM element (Jest runs without a DOM) with one
 * focusable control inside it.
 */
function buildCard() {
  const listenerByType = new Map<string, (event: MouseEvent) => void>();
  const element = {
    addEventListener: (type: string, listener: (event: MouseEvent) => void) =>
      listenerByType.set(type, listener),
    removeEventListener: (type: string) => listenerByType.delete(type),
    contains: (node: unknown) => node === element || node === innerControl,
    closest: () => element,
  };
  const innerControl = { closest: () => innerControl };

  return {
    view: element as unknown as ComponentRef<typeof View>,
    element,
    innerControl,
    listenerCount: () => listenerByType.size,
    dispatch(type: string, button: number, target: unknown) {
      const event = { button, target, preventDefault: jest.fn() };
      listenerByType.get(type)?.(event as unknown as MouseEvent);
      return event;
    },
  };
}
