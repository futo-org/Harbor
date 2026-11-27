import { APP_NAME } from '@/src/common/constants';
import { APP_DESCRIPTION, type Head } from '@/src/common/lib/head';

/** `/`, which shows the explore feed to visitors */
export const homeHead: Head = {
  title: null,
  description: APP_DESCRIPTION,
  path: '/',
};

export const exploreHead: Head = {
  title: 'Explore',
  description: `See what people are posting on ${APP_NAME} right now.`,
  path: '/explore',
};

export const explorePeopleHead: Head = {
  title: 'People',
  description: `Find people to follow on ${APP_NAME}.`,
  path: '/explore/people',
};
