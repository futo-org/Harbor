import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { ScrollView, useWindowDimensions, View } from 'react-native';
import { Portal } from '@rn-primitives/portal';
import { Atoms, useTheme, ZIndex } from '@/src/common/theme';
import { Text } from '@/src/common/components/primitives';
import { ProfileRow } from '@/src/features/profile/ProfileRow';
import { useProfile } from '@/src/features/profile/hooks/useProfile';
import { findMentionContext, useMentionStore } from '../hooks/useMentionStore';
import { useMentionSearch } from '../hooks/useMentionSearch';
import {
  type MentionAnchor,
  placeMentionOverlay,
} from '../utils/placeMentionOverlay';

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
      findMentionContext(state.text, state.selection.start)?.start ?? -1,
  );

  const { open, entries } = useMentionSearch();

  // measured once per `@` (and on resize); the `@` can still drift
  // if the page scrolls while open. Add a scroll listener if that bites.
  const [anchor, setAnchor] = useState<MentionAnchor | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-measure on resize
  useLayoutEffect(() => {
    if (!open || atIndex < 0 || !inputRef) return;
    setAnchor(measureChar(inputRef as unknown as HTMLTextAreaElement, atIndex));
  }, [open, atIndex, inputRef, win.width, win.height]);

  // Keyboard selection; reset whenever the result set changes.
  const [selected, setSelected] = useState(0);
  const entriesKey = entries.map((e) => e.identity).join(',');
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on result change
  useEffect(() => setSelected(0), [entriesKey]);
  const index = Math.min(selected, entries.length - 1);
  const selectedIdentity = open ? entries[index]?.identity : undefined;
  const selectedProfile = useProfile(selectedIdentity);

  useEffect(() => {
    if (!open) return;
    const count = entries.length;
    const onKeyDown = (e: KeyboardEvent) => {
      if (count === 0) return;
      if (e.key === 'ArrowDown') setSelected((index + 1) % count);
      else if (e.key === 'ArrowUp') setSelected((index - 1 + count) % count);
      else if ((e.key === 'Enter' || e.key === 'Tab') && selectedIdentity)
        insertMention(selectedIdentity, selectedProfile);
      else return;
      e.preventDefault();
    };
    // Capture phase: RN-web's TextInput stops keydown propagation at the root.
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [
    open,
    entries.length,
    index,
    selectedIdentity,
    selectedProfile,
    insertMention,
  ]);

  const rowRefs = useRef<(View | null)[]>([]);
  useEffect(() => {
    (
      rowRefs.current[index] as unknown as HTMLElement | undefined
    )?.scrollIntoView?.({ block: 'nearest' });
  }, [index]);

  useEffect(() => {
    console.log(open, anchor);
  }, [anchor, open]);

  if (!open || !anchor) return null;

  return (
    <Portal name={portalName}>
      <ScrollView
        // Keep the textarea focused: a blur would close the overlay before
        // the row's click lands.
        onMouseDown={(e) => e.preventDefault()}
        keyboardShouldPersistTaps="handled"
        style={[
          Atoms.fixed,
          Atoms.rounded_lg,
          placeMentionOverlay(anchor, win),
          {
            backgroundColor: theme.palette.neutral_0,
            borderWidth: 1,
            borderColor: theme.palette.neutral_50,
            zIndex: ZIndex.tooltipOverlay,
          },
        ]}
      >
        {entries.length === 0 && (
          <Text
            variant="secondary"
            color="neutral_500"
            style={[Atoms.px_md, Atoms.py_sm]}
          >
            No results
          </Text>
        )}
        {entries.map((user, i) => (
          <View
            key={user.identity}
            ref={(el) => {
              rowRefs.current[i] = el;
            }}
            onPointerEnter={() => setSelected(i)}
            style={i === index && { backgroundColor: theme.palette.neutral_25 }}
          >
            <ProfileRow
              size="sm"
              identity={user.identity}
              onPress={insertMention}
              activeStyle="none"
              style={[Atoms.px_sm]}
            />
          </View>
        ))}
      </ScrollView>
    </Portal>
  );
}

/**
 * Viewport position of the character at `index` (mirror-div trick: a hidden
 * div styled like the textarea wraps identically, so a marker span placed
 * after the same prefix lands where the character is).
 */
function measureChar(node: HTMLTextAreaElement, index: number): MentionAnchor {
  const mirror = document.createElement('div');
  const computed = getComputedStyle(node);
  for (const prop of Array.from(computed)) {
    mirror.style.setProperty(prop, computed.getPropertyValue(prop));
  }
  Object.assign(mirror.style, {
    position: 'absolute',
    visibility: 'hidden',
    top: '0',
    left: '-9999px',
    height: 'auto',
    overflow: 'hidden',
    whiteSpace: 'pre-wrap',
  });
  mirror.textContent = node.value.slice(0, index);
  const marker = document.createElement('span');
  marker.textContent = node.value[index] ?? '@';
  mirror.appendChild(marker);
  document.body.appendChild(mirror);

  const rect = node.getBoundingClientRect();
  const top = rect.top + marker.offsetTop - node.scrollTop;
  const anchor = {
    x: rect.left + marker.offsetLeft - node.scrollLeft,
    top,
    bottom: top + marker.offsetHeight,
  };
  mirror.remove();
  return anchor;
}
