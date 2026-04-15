import { useCurrentIdentity } from '@/src/common/lib/polycentric-hooks';
import { DismissReason, SheetMenu } from '@/src/common/lib/sheet';
import { router } from 'expo-router';
import { IdentitySettingsContent } from './SettingsScreen';

export default function IdentitySettingsRoute() {
  const { publicKey } = useCurrentIdentity();

  if (!publicKey) return null;

  return (
    <SheetMenu
      onClose={(reason) => {
        if (reason === DismissReason.UserDismissed) router.back();
      }}
      detents={[1]}
      dismissible
      scrollable
    >
      {(dismissSheet) => (
        <IdentitySettingsContent
          publicKey={publicKey}
          dismissSheet={dismissSheet}
        />
      )}
    </SheetMenu>
  );
}
