import { ProfileRow } from '@/src/features/profile/ProfileRow';
import { Text, TextInput } from '@/src/common/components/primitives';
import { Atoms, useTheme } from '@/src/common/theme';
import { FetchMode } from '@polycentric/react-native';
import { Fragment, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import {
  type ProfileSuggestion,
  useProfileSuggestions,
} from './useProfileSuggestions';

/**
 * Autocomplete input for picking a person: type a name, an alias
 * (`user@domain`), or paste an identity id.
 */
export function ProfileSearchInput({
  onSelect,
  placeholder = 'Search by name, alias, or identity id',
  exclude,
  pendingIdentity,
  disabled = false,
  autoFocus = false,
}: {
  onSelect: (identity: string) => void;
  placeholder?: string;
  /** Identities to omit from suggestions (e.g. the current user). */
  exclude?: readonly string[];
  /** Row to decorate with a spinner while the parent acts on it. */
  pendingIdentity?: string | null;
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  const { theme } = useTheme();
  const [query, setQuery] = useState('');
  const { suggestions, isLoading, isResolvingAlias, isSearching } =
    useProfileSuggestions(query, { exclude });

  const trimmed = query.trim();
  const showFollowingLabel =
    !trimmed && suggestions.some((s) => s.source === 'following');
  const showEmpty =
    suggestions.length === 0 && !isLoading && !isResolvingAlias && !isSearching;

  return (
    <View style={Atoms.gap_sm}>
      <View style={Atoms.px_lg}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={placeholder}
          editable={!disabled}
          disabled={disabled}
          autoFocus={autoFocus}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          accessibilityLabel="Search profiles"
        />
      </View>

      {isResolvingAlias && (
        <View
          style={[
            Atoms.flex_row,
            Atoms.align_center,
            Atoms.gap_sm,
            Atoms.px_lg,
          ]}
        >
          <ActivityIndicator
            size="small"
            color={theme.palette.neutral_500}
            accessibilityLabel="Resolving alias"
          />
          <Text variant="small" color="neutral_500">
            Looking up {trimmed}…
          </Text>
        </View>
      )}

      {isSearching && suggestions.length === 0 && !isResolvingAlias && (
        <View style={[Atoms.align_center, Atoms.p_md]}>
          <ActivityIndicator
            size="small"
            color={theme.palette.neutral_500}
            accessibilityLabel="Searching"
          />
        </View>
      )}

      {showFollowingLabel && (
        <Text
          variant="small"
          fontWeight="semibold"
          style={[theme.atoms.text_neutral_medium, Atoms.px_lg]}
        >
          People you follow
        </Text>
      )}

      <View>
        {suggestions.map((suggestion, i) => (
          <Fragment key={suggestion.identity}>
            {i > 0 && (
              <View
                style={{
                  height: 1,
                  backgroundColor: theme.palette.neutral_25,
                }}
              />
            )}
            <SuggestionRow
              suggestion={suggestion}
              pending={pendingIdentity === suggestion.identity}
              disabled={disabled || !!pendingIdentity}
              onPress={() => onSelect(suggestion.identity)}
            />
          </Fragment>
        ))}
      </View>

      {showEmpty && (
        <Text variant="small" color="neutral_500" style={Atoms.px_lg}>
          {trimmed
            ? 'No matches. Try a full alias (user@domain) or identity id.'
            : 'Not following anyone yet — enter an alias (user@domain) or identity id.'}
        </Text>
      )}
    </View>
  );
}

function SuggestionRow({
  suggestion,
  onPress,
  pending,
  disabled,
}: {
  suggestion: ProfileSuggestion;
  onPress: () => void;
  pending: boolean;
  disabled: boolean;
}) {
  const { theme } = useTheme();

  return (
    <ProfileRow
      identity={suggestion.identity}
      onPress={onPress}
      disabled={disabled}
      // Followed profiles read from cache like every other list; alias/id
      // matches are usually strangers, so fetch their profile to show a name.
      fetchMode={
        suggestion.source === 'following'
          ? FetchMode.OfflineOnly
          : FetchMode.Default
      }
      fallbackName={suggestion.name}
      fallbackAlias={suggestion.alias}
      trailing={
        pending ? (
          <ActivityIndicator
            size="small"
            color={theme.palette.primary_500}
            accessibilityLabel="Working"
          />
        ) : undefined
      }
    />
  );
}
