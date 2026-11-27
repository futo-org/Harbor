import { profileVerificationClaimsMetadata } from '@/src/features/profile/head/metadata.server';
import ProfileScreen from '@/src/features/profile/ProfileScreen';

// The profile opened on its Verifications tab; `/[identityId]` opens on Posts.
export default function ProfileVerificationsRoute() {
  return <ProfileScreen tab="verification-claims" />;
}

export const generateMetadata = profileVerificationClaimsMetadata;
