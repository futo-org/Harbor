import ProfileScreen from '@/src/features/profile/ProfileScreen';

// The profile opened on its Verifications tab; `/[identityId]` opens on Posts.
export default function ProfileVerificationsRoute() {
  return <ProfileScreen tab="verification-claims" />;
}
