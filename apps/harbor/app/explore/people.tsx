import { explorePeopleMetadata } from '@/src/features/feed/head/metadata.server';
import ExploreScreen from '@/src/features/feed/ExploreScreen';

export default function ExplorePeopleRoute() {
  return <ExploreScreen tab="people" />;
}

export const generateMetadata = explorePeopleMetadata;
