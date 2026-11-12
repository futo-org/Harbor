import Icon from '@/src/common/components/Icon';
import { TextInput } from '@/src/common/components/primitives';
import { Routes } from '@/src/common/constants';
import { Atoms, Spacing, useTheme } from '@/src/common/theme';
import { parseAnywhereUrl } from '@/src/common/util/anywhere-url';
import { SearchField } from '@/src/features/search/SearchField';
import { type Href, router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, type TextInputInstance, View } from 'react-native';

/** Shows the open page's address, and opens the one entered. */
export function AnywhereUrlField({ url = '' }: { url?: string }) {
  const inputRef = useRef<TextInputInstance>(null);
  const [text, setText] = useState(url);
  useEffect(() => setText(url), [url]);

  const submit = () => {
    const next = parseAnywhereUrl(text);
    if (!next) return;
    inputRef.current?.blur();
    if (next !== url) router.navigate(Routes.tabs.anywhere.url(next) as Href);
  };

  return (
    <SearchField onPress={() => inputRef.current?.focus()}>
      <Icon name="globe" size={16} color="neutral_500" />
      <TextInput
        ref={inputRef}
        variant="plain"
        accessibilityLabel="Web address"
        placeholder="Enter a web address"
        value={text}
        onChangeText={setText}
        onSubmitEditing={submit}
        // The whole address is replaced more often than edited.
        selectTextOnFocus
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        returnKeyType="go"
        style={[Atoms.py_0, Atoms.px_0, Atoms.flex_1]}
      />
    </SearchField>
  );
}

/** The top bar of a page's comments: a way back, and its address field. */
export function AnywhereUrlBar({ url }: { url?: string }) {
  const { theme } = useTheme();

  return (
    <View
      style={[
        Atoms.w_full,
        Atoms.align_center,
        Atoms.flex_row,
        Atoms.gap_md,
        // As the search bar on Explore.
        Atoms.px_lg,
        Atoms.py_md,
        theme.atoms.bg,
        {
          borderBottomWidth: 1,
          borderBottomColor: theme.palette.neutral_25,
        },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Go back"
        onPress={() =>
          router.canGoBack()
            ? router.back()
            : router.replace(Routes.tabs.anywhere.index)
        }
        hitSlop={Spacing.lg}
        style={({ pressed }) => [pressed && { opacity: 0.5 }]}
      >
        <Icon name="chevronBack" size={24} color="neutral_900" />
      </Pressable>
      <View style={Atoms.flex_1}>
        <AnywhereUrlField url={url} />
      </View>
    </View>
  );
}
