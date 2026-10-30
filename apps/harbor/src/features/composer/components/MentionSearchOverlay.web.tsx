import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';
import {
  ScrollView,
  useWindowDimensions,
  View,
  type ViewInstance,
} from 'react-native';
import { Portal } from '@rn-primitives/portal';
import { Kbd, Text } from '@/src/common/components/primitives';
import { Atoms, useTheme, ZIndex } from '@/src/common/theme';
import { hasPointerHover, isApplePlatform } from '@/src/common/util/platform';
import { ProfileRow } from '@/src/features/profile/ProfileRow';
import { useProfile } from '@/src/features/profile/hooks/useProfile';
import {
  findMentionContext,
  type MentionStore,
  useMentionStore,
} from '../hooks/useMentionStore';
import { useMentionSearch } from '../hooks/useMentionSearch';
import {
  useIsTutorialHintShown,
  useTutorialHintsStore,
} from '@/src/common/lib/useTutorialHintsStore';
import { placeMentionOverlay } from '../utils/placeMentionOverlay';
import {
  measureWebMentionAnchor,
  type MentionAnchor,
} from '@/src/features/composer/utils/measureWebMentionAnchor';

/**
 * Web mention autocomplete: a fixed popover portaled above everything,
 * anchored to the `@` being completed, with arrow-key selection and
 * Enter/Tab insert. Reads the live input state from the host's mention store
 * like the native version.
 */
export function MentionSearchOverlay() {
  const { theme } = useTheme();
  const win = useWindowDimensions();
  const portalName = `mention-search-${useId()}`;

  const insertMention = useMentionStore((state) => state.insertMention);
  const inputRef = useMentionStore((state) => state.inputRef);
  const atIndex = useMentionStore(
    (state) =>
      findMentionContext(state.text, state.selection.start, state.mentionRanges)
        ?.start ?? -1,
  );
  const caretIndex = useMentionStore((state) => state.selection.start);
  const text = useMentionStore((state) => state.text);

  const { open, entries } = useMentionSearch();

  // Anchored to the `@`, or to the start of the caret's line once the query
  // wraps below it. Re-measured on text/caret change and resize; the `@` can
  // still drift if the page scrolls while open. Add a scroll listener if that bites.
  const [anchor, setAnchor] = useState<MentionAnchor | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `text` and window size are reflow triggers
  useLayoutEffect(() => {
    if (!open || atIndex < 0 || !inputRef) return;
    setAnchor(
      measureWebMentionAnchor(
        inputRef as unknown as HTMLTextAreaElement,
        atIndex,
        caretIndex,
      ),
    );
  }, [open, atIndex, caretIndex, text, inputRef, win.width, win.height]);

  const { selectedIndex, setSelectedIndex } = useKeyboardControls(
    open,
    entries.map((e) => e.identity),
    insertMention,
  );

  if (!open || !anchor) return null;

  return (
    <Portal name={portalName}>
      <View
        // Keep the textarea focused: a blur would close the overlay before
        // the row's click lands.
        onMouseDown={(e) => e.preventDefault()}
        style={[
          Atoms.fixed,
          Atoms.rounded_lg,
          Atoms.overflow_hidden,
          placeMentionOverlay(anchor, win),
          {
            backgroundColor: theme.palette.neutral_0,
            borderWidth: 1,
            borderColor: theme.palette.neutral_50,
            zIndex: ZIndex.tooltipOverlay,
          },
        ]}
      >
        <ScrollView keyboardShouldPersistTaps="handled">
          {entries.map(({ identity }, i) => (
            <MentionRow
              key={identity}
              identity={identity}
              selected={i === selectedIndex}
              onHover={() => setSelectedIndex(i)}
              onPress={insertMention}
            />
          ))}
        </ScrollView>
        <MentionShortcutHint />
      </View>
    </Portal>
  );
}

function MentionRow({
  identity,
  selected,
  onHover,
  onPress,
}: {
  identity: string;
  selected: boolean;
  onHover: () => void;
  onPress: MentionStore['insertMention'];
}) {
  const { theme } = useTheme();
  const ref = useRef<HTMLElement>(null);

  // Scroll currently selecte item into view
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView?.({ block: 'nearest' });
  }, [selected]);

  return (
    <View
      ref={ref as RefObject<ViewInstance | null>}
      onPointerEnter={onHover}
      style={selected && { backgroundColor: theme.palette.neutral_25 }}
    >
      <ProfileRow
        size="sm"
        identity={identity}
        onPress={onPress}
        activeStyle="none"
        style={[Atoms.px_sm]}
      />
    </View>
  );
}

function MentionShortcutHint() {
  const { theme } = useTheme();
  const isNavigateHintShown = useIsTutorialHintShown('kbMentionNavigate');
  const isInsertHintShown = useIsTutorialHintShown('kbMentionInsert');
  if (!hasPointerHover || !isNavigateHintShown || !isInsertHintShown) {
    return null;
  }

  return (
    <View
      style={[
        Atoms.flex_row,
        Atoms.items_center,
        Atoms.gap_xs,
        Atoms.px_sm,
        Atoms.py_xs,
        {
          borderTopWidth: 1,
          borderTopColor: theme.palette.neutral_50,
        },
      ]}
    >
      <Kbd>↑</Kbd>
      <Kbd>↓</Kbd>
      <Text variant="small" color="neutral_500">
        to choose,
      </Text>
      <Kbd>Tab</Kbd>
      <Text variant="small" color="neutral_500">
        or
      </Text>
      <Kbd>{isApplePlatform ? '⏎' : 'Enter'}</Kbd>
      <Text variant="small" color="neutral_500">
        to insert
      </Text>
    </View>
  );
}

/**
 * Arrow up/down moves the selection (wrapping), Enter/Tab inserts it.
 * Selection resets whenever the result set changes.
 */
function useKeyboardControls(
  open: boolean,
  identities: string[],
  insertMention: MentionStore['insertMention'],
) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const key = identities.join(',');
  const count = identities.length;

  const safeSelectedIndex = Math.min(selectedIndex, count - 1);
  const selectedIdentity = open ? identities[safeSelectedIndex] : undefined;
  const selectedProfile = useProfile(selectedIdentity);
  const dismissHint = useTutorialHintsStore((state) => state.dismissHint);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on result change
  useEffect(() => setSelectedIndex(0), [key]);

  useEffect(() => {
    if (!open || count === 0) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        dismissHint('kbMentionNavigate');
        setSelectedIndex((safeSelectedIndex + 1) % count);
      } else if (e.key === 'ArrowUp') {
        dismissHint('kbMentionNavigate');
        setSelectedIndex((safeSelectedIndex - 1 + count) % count);
      } else if ((e.key === 'Enter' || e.key === 'Tab') && selectedIdentity) {
        dismissHint('kbMentionInsert');
        insertMention(selectedIdentity, selectedProfile);
      }
      // Any other key is handled normally
      else return;

      e.preventDefault();
    };

    document.addEventListener('keydown', onKeyDown, {
      // So we can handle keyboard controls while TextInput is focused
      capture: true,
    });
    return () =>
      document.removeEventListener('keydown', onKeyDown, { capture: true });
  }, [
    open,
    count,
    safeSelectedIndex,
    selectedIdentity,
    selectedProfile,
    insertMention,
    dismissHint,
  ]);

  return { selectedIndex: safeSelectedIndex, setSelectedIndex };
}
