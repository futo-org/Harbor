import { profileFollowersMetadata } from '@/src/features/profile/head/metadata.server';
import FollowListScreen from '@/src/features/follow/FollowListScreen';

export default function FollowersRoute() {
  return <FollowListScreen mode="followers" />;
}

export const generateMetadata = profileFollowersMetadata;
