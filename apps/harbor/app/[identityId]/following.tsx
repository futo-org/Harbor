import { profileFollowingMetadata } from '@/src/features/profile/head/metadata.server';
import FollowListScreen from '@/src/features/follow/FollowListScreen';

export default function FollowingRoute() {
  return <FollowListScreen mode="following" />;
}

export const generateMetadata = profileFollowingMetadata;
