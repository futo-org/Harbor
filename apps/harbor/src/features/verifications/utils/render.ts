import type { ClaimField } from '../hooks/useClaimById';
import { getPlatformFromClaim, PLATFORM_SCHEMA_NAME } from './platforms';

// Claim types whose title reads better as a field value than the schema name.
const TITLE_FIELD: Record<string, string> = {
  Freeform: 'name',
  Skill: 'skill',
};

/**
 * Resolve a claim's display title. Platform claims title as
 * "<account> on <platform>"; for some other claim types a field is promoted
 * to the title and omitted from the body; otherwise the schema name is the
 * title and all fields are shown.
 */
export function resolveClaimTitle(
  schemaName: string,
  fields: ClaimField[],
): { title: string; bodyFields: ClaimField[] } {
  if (schemaName === PLATFORM_SCHEMA_NAME) {
    const account = fields.find((f) => f.key === 'account')?.value;
    const platformName =
      getPlatformFromClaim(schemaName, fields)?.name ??
      fields.find((f) => f.key === 'platform')?.value;
    if (account) {
      return {
        // Both title parts also show in the type chip; the body keeps the
        // rest (account id, profile URL, …).
        title: platformName ? `${account} on ${platformName}` : account,
        bodyFields: fields.filter(
          (f) => f.key !== 'account' && f.key !== 'platform',
        ),
      };
    }
  }

  const titleKey = TITLE_FIELD[schemaName];
  const titleField = titleKey
    ? fields.find((f) => f.key === titleKey)
    : undefined;

  return {
    title: titleField?.value || schemaName,
    bodyFields: titleField ? fields.filter((f) => f.key !== titleKey) : fields,
  };
}
