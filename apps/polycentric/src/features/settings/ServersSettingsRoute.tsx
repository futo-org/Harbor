import { DismissReason, SheetMenu } from '@/src/common/lib/sheet';
import { router } from 'expo-router';
import { ServersSheetContent } from './SettingsScreen';

export default function ServersSettingsRoute() {
  return (
    <SheetMenu
      onClose={(reason) => {
        if (reason === DismissReason.UserDismissed) router.back();
      }}
      detents={[0.5, 1]}
      dismissible
      scrollable
    >
      {(dismissSheet) => <ServersSheetContent dismissSheet={dismissSheet} />}
    </SheetMenu>
  );
}
