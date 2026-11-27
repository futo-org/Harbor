import type { CalendarEventData } from '@/src/features/calendar-events/lib/calendar-event';
import { CLAIM_TYPES } from '../../../utils/forms';
import {
  attendanceClaimLink,
  claimLink,
  parseClaimLink,
  parseClaimLinkUrl,
} from './claim-link';

jest.mock('@/src/common/constants', () => ({
  HARBOR_APP_URL: 'https://harbor.test',
}));

const IDENTITY = 'a'.repeat(64);

const paramsOf = (link: string) =>
  Object.fromEntries(new URL(link).searchParams.entries());

const skill = CLAIM_TYPES.find((type) => type.name === 'Skill');
if (!skill) throw new Error('no Skill claim type');

describe('claim links', () => {
  it('round trips a prefilled claim', () => {
    const link = `${claimLink(skill, {
      skill: 'Welding & brazing',
      description: 'Level 2',
    })}&from=${IDENTITY}`;

    expect(link.startsWith('https://harbor.test/verifications/create?')).toBe(
      true,
    );

    const parsed = parseClaimLink(paramsOf(link));

    expect(parsed?.claimType).toBe(skill);
    expect(parsed?.values).toEqual({
      skill: 'Welding & brazing',
      description: 'Level 2',
    });
    expect(parsed?.requestFrom).toBe(IDENTITY);
  });

  it('matches the claim type whatever the case', () => {
    expect(parseClaimLink({ claim: 'skill' })?.claimType).toBe(skill);
  });

  it('ignores params that are not fields of the claim type', () => {
    const parsed = parseClaimLink({ claim: 'Skill', company: 'FUTO' });

    expect(parsed?.values).toEqual({});
  });

  it('drops a requester that is not an identity', () => {
    const parsed = parseClaimLink({ claim: 'Skill', from: 'nope' });

    expect(parsed?.requestFrom).toBeUndefined();
  });

  it('round trips an attendance claim', () => {
    const event = {
      identity: IDENTITY,
      keyFingerprint: 'abc123',
      sequence: '42',
    } as CalendarEventData;

    const parsed = parseClaimLink(paramsOf(attendanceClaimLink(event)));

    expect(parsed?.claimType.name).toBe('Attendance');
    expect(parsed?.event).toEqual({
      identity: IDENTITY,
      keyFingerprint: 'abc123',
      sequence: 42n,
    });
  });

  it('does not take the hidden event fields from the link', () => {
    const parsed = parseClaimLink({
      claim: 'Attendance',
      event: `${IDENTITY}/abc123/42`,
      event_key: 'forged',
      starts_at: '2020-01-01',
    });

    expect(parsed?.values).toEqual({});
  });

  it('reads a scanned link', () => {
    const link = claimLink(skill, { skill: 'Welding' });

    expect(parseClaimLinkUrl(` ${link}\n`)?.values).toEqual({
      skill: 'Welding',
    });
    expect(
      parseClaimLinkUrl('harbor://verifications?claim=skill'),
    ).not.toBeNull();
  });

  it.each(['', 'not a link', 'https://harbor.test/feed'])(
    'rejects scanning %j',
    (scanned) => {
      expect(parseClaimLinkUrl(scanned)).toBeNull();
    },
  );

  it.each([
    [{}],
    [{ claim: 'Unknown' }],
    [{ claim: 'Platform' }],
    [{ claim: 'Attendance' }],
    [{ claim: 'Attendance', event: 'not-an-event' }],
  ])('rejects %j', (params) => {
    expect(parseClaimLink(params)).toBeNull();
  });
});
