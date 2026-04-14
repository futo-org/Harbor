import 'fast-text-encoding';

export * from '@polycentric/js-core';
export * as types from '@polycentric/js-core';

export { polycentric_ffi as types_ffi } from './generated/protocol';

export {
  createPolycentricClient,
  createIdentity,
} from './create-polycentric-client';
