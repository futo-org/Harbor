import { createFixedMetadata } from '@/src/common/lib/page-metadata/create-fixed-metadata';

/** `/`, which shows the explore feed to visitors */
export const homeMetadata = createFixedMetadata('/', null);

export const exploreMetadata = createFixedMetadata(
  '/explore',
  'Explore',
  'See what people are posting on Harbor right now.',
);

export const explorePeopleMetadata = createFixedMetadata(
  '/explore/people',
  'People',
  'Find people to follow on Harbor.',
);
