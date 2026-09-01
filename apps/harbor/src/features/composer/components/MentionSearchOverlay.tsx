import { useEffect } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AVATAR_SIZE_MAP } from '@/src/common/components';
import { ScrollView } from '@/src/common/components/ScrollView';
import { Atoms, Spacing, useTheme } from '@/src/common/theme';
import { ProfileRow } from '@/src/features/profile/ProfileRow';
import { useSearchUsers } from '@/src/features/search/hooks/useSearchUsers';
import { selectMentionQuery, useMentionStore } from '../hooks/useMentionStore';
import { useDebouncedValue } from '@/src/features/search/hooks/useDebouncedValue';

/**
 * Mention autocomplete results, anchored below the composer's input. Fully
 * self-contained: reads the live input state from the host's mention store
 * (see `MentionProvider`), searches, and inserts the tapped mention. Mount it
 * in the composer host, as a sibling of the fields container.
 */
export function MentionSearchOverlay() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  const rawQuery = useMentionStore(selectMentionQuery);
  const inputHeight = useMentionStore((state) => state.inputLayout.height);
  const inputPageY = useMentionStore((state) => state.inputPageY);
  const insertMention = useMentionStore((state) => state.insertMention);

  const query = useDebouncedValue(rawQuery?.trim());

  const users = useSearchUsers(query ?? '', {
    limit: 10,
    enabled: !!query,
  });

  const measureInput = useMentionStore((state) => state.measureInput);
  const open = !!query && users.entries.length > 0;

  // Measure when opening, not at input mount: by now the layout above the
  // input (reply preview) has settled, so the anchor is correct.
  useEffect(() => {
    if (open) measureInput();
  }, [open, measureInput]);

  if (!open) return null;

  return (
    <View
      style={[
        Atoms.absolute,
        Atoms.rounded_xl,
        {
          backgroundColor: theme.palette.neutral_0,
          borderWidth: 1,
          borderColor: theme.palette.neutral_50,
          left: Spacing.md,
          right: Spacing.md,
          bottom: Spacing.md,
          top:
            Math.max(inputHeight, AVATAR_SIZE_MAP.md) +
            Spacing.md +
            (inputPageY - insets.top),
          zIndex: 1,
        },
      ]}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={Atoms.gap_md}
        style={{ flex: 1, padding: 10 }}
      >
        {users.entries.map((user) => (
          <ProfileRow
            size="sm"
            key={user.identity}
            identity={user.identity}
            onPress={insertMention}
            activeStyle="none"
            style={[Atoms.px_0, Atoms.py_0]}
          />
        ))}
      </ScrollView>
    </View>
  );
}
