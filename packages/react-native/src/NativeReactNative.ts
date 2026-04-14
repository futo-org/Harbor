import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

// Codegen does not support Uint8Array so we use Object here instead.
// Native layer expects Uint8Array and does validation.
export interface Spec extends TurboModule {
  verifySignedEventV2(signedEventBytes: Object): Object;
  decodeEventFromSignedEventV2(signedEventBytes: Object): Object;
  validateEventV2(eventBytes: Object): Object;
  nextSequenceV2(
    identity: Object,
    collection: number,
    signedBy: Object
  ): Object;
  buildVectorClockV2(
    identity: Object,
    collection: number,
    identitySequence: number,
    signedBy: Object,
    currentSequence: number
  ): Object;
  copyEventV2(signedEventBytes: Object): Object;
  copyContentV2(digestBytes: Object, contentBytes: Object): Object;
}

export default TurboModuleRegistry.getEnforcing<Spec>('PolycentricCore');
