import { explorePeopleMetadata } from '@/src/features/feed/metadata';
import ExploreScreen from '@/src/features/feed/ExploreScreen';

export default function ExplorePeopleRoute() {
  return <ExploreScreen tab="people" />;
}

export const generateMetadata = explorePeopleMetadata;
