import { getKeyFingerprint } from '@/src/common/lib/polycentric-hooks/helpers';
import { eventKeyFromId } from '@/src/features/calendar-events/lib/calendar-queries';
import type { DecodedClaim } from '../../../hooks/useClaimById';
import { ATTENDANCE_FIELD } from '../../../utils/attendance';
import { CLAIM_TYPES } from '../../../utils/forms';
import { attendanceClaimLink, claimLink } from './claim-link';

/** Link that opens a copy of the claim. Null for claims that can't be copied */
export function claimCloneLink(claim: DecodedClaim): string | null {
  const claimType = CLAIM_TYPES.find((type) => type.name === claim.schemaName);
  if (!claimType || claimType.platform) return null;

  const values = Object.fromEntries(
    claim.fields.map((field) => [field.key, field.value]),
  );

  if (!claimType.calendarEvent) return claimLink(claimType, values);

  try {
    const key = eventKeyFromId(values[ATTENDANCE_FIELD.eventKey] ?? '');
    if (!key.signedBy || !key.identity) return null;

    return attendanceClaimLink({
      identity: key.identity,
      keyFingerprint: getKeyFingerprint(key.signedBy),
      sequence: key.sequence,
    });
  } catch {
    return null;
  }
}
