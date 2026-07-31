import { PillButton } from '@/src/common/components/primitives';
import Icon from '@/src/common/components/Icon';

export function EditButton() {
  return (
    <PillButton
      onPress={() => {}}
      title="Edit"
      variant="primary"
      icon={(props) => <Icon name="settings" {...props} />}
    />
  );
}
