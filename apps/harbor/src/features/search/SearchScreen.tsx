import Icon from '@/src/common/components/Icon';
import { Screen } from '@/src/common/components/layout';
import { TOPBAR_HEIGHT } from '@/src/common/components/layout/Topbar';
import { Text, TextInput } from '@/src/common/components/primitives';
import { Atoms, Spacing, useTheme, withHexOpacity } from '@/src/common/theme';
import { isWeb } from '@/src/common/util/platform';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Keyboard,
  Pressable,
  type TextInput as RNTextInput,
  View,
} from 'react-native';
import { SearchField } from './SearchField';
import { SearchResults, type SearchTab } from './SearchResults';
import { useDebouncedValue } from './hooks/useDebouncedValue';

function SearchTopbar({ children }: { children: ReactNode }) {
  const { theme } = useTheme();

  const goBack = () => {
    if (router.canGoBack()) router.back();
  };

  return (
    <View
      style={[
        Atoms.w_full,
        Atoms.align_center,
        Atoms.flex_row,
        Atoms.px_md,
        Atoms.py_sm,
        Atoms.gap_md,
        { height: TOPBAR_HEIGHT },
        { backgroundColor: theme.palette.neutral_0 },
        {
          borderBottomWidth: 1,
          borderBottomColor: withHexOpacity(theme.palette.neutral_500, '10'),
        },
      ]}
    >
      {isWeb ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={goBack}
          hitSlop={Spacing.lg}
          style={({ pressed }) => [pressed && { opacity: 0.5 }]}
        >
          <Icon name="chevronBack" size={24} color="neutral_900" />
        </Pressable>
      ) : null}
      <View style={Atoms.flex_1}>{children}</View>
      {!isWeb ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cancel search"
          onPress={goBack}
          hitSlop={Spacing.lg}
          style={({ pressed }) => [pressed && { opacity: 0.5 }]}
        >
          <Text color="neutral_500">Cancel</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export default function SearchScreen() {
  const params = useLocalSearchParams<{ q?: string; f?: string }>();
  const paramQuery = typeof params.q === 'string' ? params.q.trim() : '';
  const tab: SearchTab =
    params.f === 'latest' || params.f === 'people' ? params.f : 'top';

  const [query, setQuery] = useState(paramQuery);
  const [submitted, setSubmitted] = useState(!!paramQuery);
  const inputRef = useRef<RNTextInput>(null);
  const pendingRefocus = useRef(false);
  const debouncedQuery = useDebouncedValue(query.trim());

  useEffect(() => {
    if (!paramQuery) return;
    setQuery(paramQuery);
    setSubmitted(true);
  }, [paramQuery]);

  const submit = () => {
    if (!query.trim()) return;
    router.setParams({ ...params, q: query.trim() });
    setSubmitted(true);
    Keyboard.dismiss();
  };

  const clear = () => {
    setQuery('');
    setSubmitted(false);
    router.setParams({ q: '', f: '' });
    inputRef.current?.focus();
  };

  // The topbar lives inside each list's hiding header, so leaving the
  // full-results view remounts the input; restore focus afterwards.
  useEffect(() => {
    if (!submitted && pendingRefocus.current) {
      pendingRefocus.current = false;
      inputRef.current?.focus();
    }
  }, [submitted]);

  const input = (
    <SearchField onPress={() => inputRef.current?.focus()}>
      <Icon name="search" size={16} color="neutral_500" />
      <TextInput
        ref={inputRef}
        variant="plain"
        placeholder="Search"
        value={query}
        onChangeText={setQuery}
        onFocus={() => {
          if (submitted) {
            pendingRefocus.current = true;
            setSubmitted(false);
          }
        }}
        onSubmitEditing={submit}
        returnKeyType="search"
        autoFocus={!submitted}
        style={[Atoms.py_0, Atoms.px_0, Atoms.flex_1]}
      />
      {query.length > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          onPress={clear}
          hitSlop={Spacing.sm}
          style={({ pressed }) => [pressed && { opacity: 0.5 }]}
        >
          <Icon name="close" size={16} color="neutral_500" />
        </Pressable>
      ) : null}
    </SearchField>
  );

  if (isWeb) {
    return (
      <Screen>
        <Screen.PrimaryColumn>
          <SearchTopbar>{input}</SearchTopbar>
          <SearchResults
            phrase={query.trim()}
            query={submitted ? query.trim() : debouncedQuery}
            submitted={submitted}
            tab={tab}
            onTabChange={(next) => router.setParams({ f: next })}
            onSubmitQuery={submit}
          />
        </Screen.PrimaryColumn>
      </Screen>
    );
  }

  return (
    <Screen>
      <Screen.PrimaryColumn>
        <SearchResults
          phrase={query.trim()}
          query={submitted ? query.trim() : debouncedQuery}
          submitted={submitted}
          tab={tab}
          onTabChange={(next) => router.setParams({ f: next })}
          onSubmitQuery={submit}
          topbar={<SearchTopbar>{input}</SearchTopbar>}
        />
      </Screen.PrimaryColumn>
    </Screen>
  );
}
