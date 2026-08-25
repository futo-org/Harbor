import Icon from '@/src/common/components/Icon';
import { TextInput } from '@/src/common/components/primitives';
import { Routes } from '@/src/common/constants';
import {
  Atoms,
  BorderRadius,
  Spacing,
  useTheme,
  ZIndex,
} from '@/src/common/theme';
import { ProfileRow } from '@/src/features/profile/ProfileRow';
import { router, usePathname } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { SearchPhraseRow } from './SearchResults';
import { SearchField } from './SearchField';
import { useDebouncedValue } from './hooks/useDebouncedValue';
import { useSearchUsers } from './hooks/useSearchUsers';

export function SidebarSearch() {
  const { theme } = useTheme();
  const pathname = usePathname();
  const [query, setQuery] = useState('');
  const phrase = query.trim();
  const debounced = useDebouncedValue(phrase);
  const users = useSearchUsers(debounced, { limit: 8 });

  // Explore and search carry their own search field.
  if (
    pathname === Routes.tabs.explore.index ||
    pathname === Routes.tabs.explore.people ||
    pathname === Routes.tabs.explore.search
  ) {
    return null;
  }

  const submit = () => {
    if (!phrase) return;
    setQuery('');
    router.push(
      `${Routes.tabs.explore.search}?q=${encodeURIComponent(phrase)}`,
    );
  };

  return (
    <View style={[Atoms.w_full, { zIndex: ZIndex.raised }]}>
      <SearchField>
        <Icon name="search" size={16} color="neutral_500" />
        <TextInput
          variant="plain"
          placeholder="Search"
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={submit}
          returnKeyType="search"
          style={[Atoms.py_0, Atoms.px_0, Atoms.flex_1]}
        />
        {query.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Clear search"
            onPress={() => setQuery('')}
            hitSlop={Spacing.sm}
            style={({ pressed }) => [pressed && { opacity: 0.5 }]}
          >
            <Icon name="close" size={16} color="neutral_500" />
          </Pressable>
        ) : null}
      </SearchField>
      {phrase ? (
        <View
          style={[
            Atoms.w_full,
            Atoms.overflow_hidden,
            {
              position: 'absolute',
              top: '100%',
              marginTop: Spacing.sm,
              backgroundColor: theme.palette.neutral_0,
              borderWidth: 1,
              borderColor: theme.palette.neutral_25,
              borderRadius: BorderRadius.lg,
            },
          ]}
        >
          <SearchPhraseRow phrase={phrase} onPress={submit} />
          {users.entries.map((entry) => (
            <ProfileRow
              key={entry.identity}
              identity={entry.identity}
              onPress={() => {
                setQuery('');
                router.push(Routes.tabs.profile(entry.identity));
              }}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}
