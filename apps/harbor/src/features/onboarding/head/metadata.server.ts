import { createFixedMetadata } from '@/src/common/lib/head/create-fixed-metadata.server';
import { loginHead, signupHead } from './index';

export const loginMetadata = createFixedMetadata(loginHead);

export const signupMetadata = createFixedMetadata(signupHead);
