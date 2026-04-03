import { PillButton } from '@/src/common/components/primitives';
import { Ionicons } from '@expo/vector-icons';

export function EditButton() {
  return (
    <PillButton
      onPress={() => {}}
      title="Edit"
      variant="primary"
      icon={(props) => <Ionicons name="settings-outline" {...props} />}
    />
  );
}
