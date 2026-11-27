import { Text, TextInput } from '@/src/common/components';
import Icon from '@/src/common/components/Icon';
import { useUsername } from '@/src/common/lib/polycentric-hooks';
import { Atoms, useTheme } from '@/src/common/theme';
import { ProfileRow } from '@/src/features/profile/ProfileRow';
import { useDebouncedValue } from '@/src/features/search/hooks/useDebouncedValue';
import { useSearchUsers } from '@/src/features/search/hooks/useSearchUsers';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { SuggestionList } from './SuggestionList';

const MAX_HOSTS = 10;

type HostFieldProps = {
  hosts: string[];
  onChange: (hosts: string[]) => void;
  disabled?: boolean;
};

/** Search and pick hosts */
export function HostField({ hosts, onChange, disabled }: HostFieldProps) {
  const [text, setText] = useState('');
  const query = useDebouncedValue(text.trim(), 300);

  const { entries } = useSearchUsers(query, {
    limit: 5,
    enabled: query.length > 0,
  });

  const suggestions = query
    ? entries.filter((entry) => !hosts.includes(entry.identity))
    : [];

  return (
    <View style={Atoms.gap_sm}>
      {hosts.length === 0 ? null : (
        <View style={[Atoms.flex_row, Atoms.flex_wrap, Atoms.gap_sm]}>
          {hosts.map((identity) => (
            <HostChip
              key={identity}
              identity={identity}
              disabled={disabled}
              onRemove={() =>
                onChange(hosts.filter((host) => host !== identity))
              }
            />
          ))}
        </View>
      )}
      {hosts.length < MAX_HOSTS ? (
        <View>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Find who is hosting, if anyone"
            disabled={disabled}
            testID="calendar-event-create-host"
          />
          {suggestions.length > 0 ? (
            <SuggestionList>
              {suggestions.map((entry) => (
                <ProfileRow
                  key={entry.identity}
                  identity={entry.identity}
                  activeStyle="none"
                  onPress={(identity) => {
                    onChange([...hosts, identity]);
                    setText('');
                  }}
                />
              ))}
            </SuggestionList>
          ) : null}
        </View>
      ) : null}
      {hosts.length > 0 ? (
        <Text variant="small" color="muted" fontWeight="regular">
          They are asked to host, and show as hosts once they accept.
        </Text>
      ) : null}
    </View>
  );
}

type HostChipProps = {
  identity: string;
  disabled?: boolean;
  onRemove: () => void;
};

function HostChip({ identity, disabled, onRemove }: HostChipProps) {
  const { theme } = useTheme();
  const name = useUsername(identity);

  return (
    <View
      style={[
        Atoms.flex_row,
        Atoms.align_center,
        Atoms.gap_xs,
        Atoms.rounded_full,
        { paddingLeft: 12, paddingRight: 6, paddingVertical: 4 },
        theme.atoms.box.raised.bg,
      ]}
    >
      <Text variant="secondary" numberOfLines={1}>
        {name}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Remove ${name}`}
        disabled={disabled}
        onPress={onRemove}
        hitSlop={8}
      >
        <Icon name="closeCircle" size={18} color="muted" />
      </Pressable>
    </View>
  );
}
