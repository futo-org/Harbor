import type { PostLabel } from '@/src/common/lib/polycentric-hooks/helpers';
import { useIdentityHandle } from '@/src/features/profile/hooks/useIdentityHandle';
import { useProfile } from '@/src/features/profile/hooks/useProfile';

/** Who applied the labels: a display name, or whether it was the subject. */
export function useLabeler(
  labels: PostLabel[],
  subjectIdentity: string | null,
): { name: string; isSubject: boolean } | null {
  const labeledBy = labels.find((l) => l.labeledBy)?.labeledBy ?? null;
  const isSubject = labeledBy !== null && labeledBy === subjectIdentity;
  const labeler = isSubject ? null : labeledBy;
  const profile = useProfile(labeler);
  const handle = useIdentityHandle(labeler);
  if (!labeledBy) return null;
  return { name: profile.name ?? handle.text, isSubject };
}
