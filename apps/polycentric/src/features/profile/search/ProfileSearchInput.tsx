import { ProfileAvatar } from '@/src/common/components/Avatar/ProfileAvatar';
import { Text, TextInput } from '@/src/common/components/primitives';
import {
  shortenIdentityId,
  truncateName,
} from '@/src/common/lib/polycentric-hooks';
import { Atoms, useTheme } from '@/src/common/theme';
import { useProfile } from '@/src/features/profile/hooks/useProfile';
import { FetchMode } from '@polycentric/react-native';
import { Fragment, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
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
  const { suggestions, isLoading, isResolvingAlias } = useProfileSuggestions(
    query,
    { exclude },
  );

  const trimmed = query.trim();
  const showFollowingLabel =
    !trimmed && suggestions.some((s) => s.source === 'following');
  const showEmpty = suggestions.length === 0 && !isLoading && !isResolvingAlias;

  return (
    <View style={Atoms.gap_sm}>
      <View style={Atoms.px_lg}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={placeholder}
          editable={!disabled}
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
  // Followed profiles read from cache like every other list; alias/id
  // matches are usually strangers, so fetch their profile to show a name.
  const profile = useProfile(suggestion.identity, {
    fetchMode:
      suggestion.source === 'following'
        ? FetchMode.OfflineOnly
        : FetchMode.Default,
  });
  const name = profile.name ?? suggestion.name;
  const alias = profile.alias ?? suggestion.alias;

  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      style={({ hovered, pressed }) => [
        (hovered || pressed) && {
          backgroundColor: theme.palette.neutral_25,
        },
      ]}
    >
      <View
        style={[
          Atoms.flex_row,
          Atoms.align_center,
          Atoms.gap_md,
          Atoms.px_lg,
          Atoms.py_md,
        ]}
      >
        <ProfileAvatar identityKey={suggestion.identity} size="md" />
        <View style={Atoms.flex_1}>
          <Text
            variant="secondary"
            fontWeight="semibold"
            numberOfLines={1}
            selectable={false}
          >
            {name ? truncateName(name, 32) : 'Anonymous'}
          </Text>
          <Text
            variant="small"
            color="neutral_500"
            numberOfLines={1}
            selectable={false}
            style={alias ? undefined : { fontFamily: 'monospace' }}
          >
            {alias ?? shortenIdentityId(suggestion.identity)}
          </Text>
        </View>
        {pending && (
          <ActivityIndicator
            size="small"
            color={theme.palette.primary_500}
            accessibilityLabel="Working"
          />
        )}
      </View>
    </Pressable>
  );
}
