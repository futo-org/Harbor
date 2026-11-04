import { parseEventKeyId, type v2 } from '@polycentric/react-native';

/** The event key a claim id (`DecodedClaim.id`, an `eventKeyId`) names.
 *  Throws if `claimId` isn't one. */
export function claimEventKey(claimId: string): v2.EventKey {
  const key = parseEventKeyId(claimId);
  if (!key) throw new Error(`Invalid claim id: ${claimId}`);
  return key;
}
