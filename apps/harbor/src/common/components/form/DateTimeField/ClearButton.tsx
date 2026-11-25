import { Atoms } from '@/src/common/theme';
import { Pressable } from 'react-native';
import Icon from '../../Icon';

export const CLEAR_BUTTON_SPACE = 40;

type ClearButtonProps = {
  onPress: () => void;
  testID?: string;
};

/** Clears the field. Sits over its right edge */
export function ClearButton({ onPress, testID }: ClearButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Clear"
      testID={testID}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [
        Atoms.absolute,
        Atoms.justify_center,
        { top: 0, bottom: 0, right: 12 },
        pressed && Atoms.faded,
      ]}
    >
      <Icon name="closeCircle" size={20} color="muted" />
    </Pressable>
  );
}
