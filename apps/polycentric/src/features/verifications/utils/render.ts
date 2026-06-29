import { ClaimField } from '../hooks/useClaimById';

// Claim types whose title reads better as a field value than the schema name.
const TITLE_FIELD: Record<string, string> = {
  Freeform: 'name',
  Skill: 'skill',
};

/**
 * Resolve a claim's display title. For some claim types a field is promoted to
 * the title and omitted from the body; otherwise the schema name is the title
 * and all fields are shown.
 */
export function resolveClaimTitle(
  schemaName: string,
  fields: ClaimField[],
): { title: string; bodyFields: ClaimField[] } {
  const titleKey = TITLE_FIELD[schemaName];
  const titleField = titleKey
    ? fields.find((f) => f.key === titleKey)
    : undefined;

  return {
    title: titleField?.value || schemaName,
    bodyFields: titleField ? fields.filter((f) => f.key !== titleKey) : fields,
  };
}
