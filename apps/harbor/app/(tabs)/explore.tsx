import { exploreMetadata } from '@/src/features/feed/metadata';
import ExploreScreen from '@/src/features/feed/ExploreScreen';

export default function FeedIndexRoute() {
  return <ExploreScreen />;
}

export const generateMetadata = exploreMetadata;
