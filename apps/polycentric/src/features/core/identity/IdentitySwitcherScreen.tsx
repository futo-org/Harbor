import { IdentitySwitcher } from '@/src/features/core/identity/IdentitySwitcher';
import { DismissReason, SheetMenu } from '@/src/common/lib/sheet';
import { router } from 'expo-router';

export default function IdentitySwitcherScreen() {
  return (
    <SheetMenu
      onClose={(reason) => {
        if (reason === DismissReason.UserDismissed) router.back();
      }}
      detents={[0.5, 1]}
      scrollable
    >
      {(dismissSheet) => <IdentitySwitcher dismissSheet={dismissSheet} />}
    </SheetMenu>
  );
}
