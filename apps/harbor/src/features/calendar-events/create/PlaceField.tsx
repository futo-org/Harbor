import { Text, TextInput } from '@/src/common/components';
import Icon from '@/src/common/components/Icon';
import { Atoms, useTheme } from '@/src/common/theme';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { usePlaceSearch } from '../hooks/usePlaceSearch';
import type { Place } from '../lib/geocoder-api';
import { SuggestionList } from './SuggestionList';

type PlaceFieldProps = {
  value: string;
  onChangeText: (text: string) => void;
  onChoose: (place: Place) => void;
  /** The text is a picked place, so don't search for it again */
  picked: boolean;
  disabled?: boolean;
};

/** Location input with place search */
export function PlaceField({
  value,
  onChangeText,
  onChoose,
  picked,
  disabled,
}: PlaceFieldProps) {
  const { theme } = useTheme();
  const [isFocused, setFocused] = useState(false);
  const places = usePlaceSearch(value, isFocused && !picked);

  return (
    <View>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        // Delay so a tap on a suggestion still lands
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        placeholder="Search for a venue or address"
        maxLength={200}
        disabled={disabled}
        testID="calendar-event-create-place"
      />
      {places.length > 0 ? (
        <SuggestionList>
          {places.map((place) => (
            <Pressable
              key={place.id}
              accessibilityRole="button"
              testID="calendar-event-create-place-suggestion"
              onPress={() => onChoose(place)}
              style={({ hovered, pressed }) => [
                Atoms.flex_row,
                Atoms.align_center,
                Atoms.gap_sm,
                Atoms.px_md,
                Atoms.py_sm,
                (hovered || pressed) && theme.atoms.box.secondary.bg_hover,
              ]}
            >
              <Icon name="location" size={18} color="muted" />
              <View style={Atoms.flex_1}>
                <Text
                  variant="secondary"
                  fontWeight="semibold"
                  numberOfLines={1}
                >
                  {place.name}
                </Text>
                {place.address ? (
                  <Text variant="small" color="muted" numberOfLines={1}>
                    {place.address}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          ))}
          <Text
            variant="small"
            color="muted"
            style={[Atoms.px_md, Atoms.py_xs]}
          >
            © OpenStreetMap contributors
          </Text>
        </SuggestionList>
      ) : null}
    </View>
  );
}
