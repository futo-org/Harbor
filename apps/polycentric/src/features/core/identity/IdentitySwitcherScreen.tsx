import { IdentitySwitcherSheet } from '@/src/features/core/identity/IdentitySwitcher';
import { useRequireAccount } from '@/src/common/lib/navigation/useRequireAccount';

export default function IdentitySwitcherScreen() {
  useRequireAccount();
  return <IdentitySwitcherSheet />;
}
