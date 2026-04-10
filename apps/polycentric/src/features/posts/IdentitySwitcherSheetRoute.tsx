import { IdentitySwitcherSheetInner } from '@/src/common/components/composites/IdentitySwitcherSheetInner';
import { DismissReason, SheetMenu } from '@/src/common/lib/sheet';
import { router } from 'expo-router';

export default function IdentitySwitcherSheetRoute() {
  return (
    <SheetMenu
      open
      onClose={(reason) => {
        if (reason === DismissReason.UserDismissed) router.back();
      }}
      detents={[0.5, 1]}
      scrollable
    >
      {(dismissSheet) => (
        <IdentitySwitcherSheetInner dismissSheet={dismissSheet} />
      )}
    </SheetMenu>
  );
}
