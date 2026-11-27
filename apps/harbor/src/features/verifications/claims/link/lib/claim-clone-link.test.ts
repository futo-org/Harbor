import type { DecodedClaim } from '../../../hooks/useClaimById';
import { claimCloneLink } from './claim-clone-link';
import { parseClaimLinkUrl } from './claim-link';

jest.mock('@/src/common/constants', () => ({
  HARBOR_APP_URL: 'https://harbor.test',
}));

const IDENTITY = 'a'.repeat(64);

jest.mock('@/src/common/lib/polycentric-hooks/helpers', () => ({
  getKeyFingerprint: () => 'abc123',
}));

jest.mock('@/src/features/calendar-events/lib/calendar-queries', () => ({
  eventKeyFromId: (id: string) => {
    if (id !== 'eventhex') throw new Error('bad key');
    return { identity: 'a'.repeat(64), signedBy: {}, sequence: 42n };
  },
}));

const claimOf = (
  schemaName: string,
  fields: Record<string, string>,
): DecodedClaim =>
  ({
    schemaName,
    fields: Object.entries(fields).map(([key, value]) => ({
      key,
      label: key,
      value,
    })),
  }) as DecodedClaim;

describe('claimCloneLink', () => {
  it('carries the claim values', () => {
    const link = claimCloneLink(
      claimOf('Skill', { skill: 'Welding', description: '' }),
    );

    expect(parseClaimLinkUrl(link ?? '')?.values).toEqual({ skill: 'Welding' });
  });

  it('points an attendance claim at its event', () => {
    const link = claimCloneLink(
      claimOf('Attendance', { event: 'Meetup', event_key: 'eventhex' }),
    );

    expect(parseClaimLinkUrl(link ?? '')?.event).toEqual({
      identity: IDENTITY,
      keyFingerprint: 'abc123',
      sequence: 42n,
    });
  });

  it.each([
    ['Platform', {}],
    ['Something else', {}],
    ['Attendance', { event_key: 'garbage' }],
  ])('has no link for %s %j', (schemaName, fields) => {
    expect(claimCloneLink(claimOf(schemaName, fields))).toBeNull();
  });
});
