import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

// Codegen does not support Uint8Array so we use Object here instead.
// Native layer expects Uint8Array and does validation.
export interface Spec extends TurboModule {
  verifySignedEvent(signedEventBytes: Object): Object;
  decodeEventFromSignedEvent(signedEventBytes: Object): Object;
  validateEvent(eventBytes: Object): Object;
  nextSequence(identity: Object, collection: number, signedBy: Object): Object;
  buildVectorClock(
    identity: Object,
    collection: number,
    identitySequence: number,
    signedBy: Object,
    currentSequence: number
  ): Object;
  copyEvent(signedEventBytes: Object): Object;
  copyContent(digestBytes: Object, contentBytes: Object): Object;
}

export default TurboModuleRegistry.getEnforcing<Spec>('PolycentricCore');
