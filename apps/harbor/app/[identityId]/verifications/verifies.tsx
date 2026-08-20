import ProfileScreen from '@/src/features/profile/ProfileScreen';

// The profile opened on its Verifies tab; `/[identityId]` opens on Posts.
export default function ProfileVerifiesRoute() {
  return <ProfileScreen tab="verification-verifies" />;
}
