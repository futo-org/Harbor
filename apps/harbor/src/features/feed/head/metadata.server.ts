import { createFixedMetadata } from '@/src/common/lib/head/create-fixed-metadata.server';
import { exploreHead, explorePeopleHead, homeHead } from './index';

export const homeMetadata = createFixedMetadata(homeHead);

export const exploreMetadata = createFixedMetadata(exploreHead);

export const explorePeopleMetadata = createFixedMetadata(explorePeopleHead);
