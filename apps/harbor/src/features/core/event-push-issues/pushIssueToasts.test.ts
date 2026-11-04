import type { EventKey } from '@polycentric/react-native';

jest.mock('@polycentric/react-native', () => ({
  v2: jest.requireActual('../../../../../../packages/js-core/src/proto/v2'),
}));

const mockNavigate = jest.fn();
jest.mock('expo-router', () => ({
  router: { navigate: (...args: unknown[]) => mockNavigate(...args) },
}));

const mockToast = { error: jest.fn(), warning: jest.fn() };
jest.mock('@/src/common/components/toast/useToast', () => ({
  toast: {
    error: (...args: unknown[]) => mockToast.error(...args),
    warning: (...args: unknown[]) => mockToast.warning(...args),
  },
}));

jest.mock('@/src/common/constants/routes', () => ({
  Routes: { tabs: { settings: { syncEvents: '/settings/sync-events' } } },
}));

import { showPushIssueToasts } from './pushIssueToasts';
import type { EventPushIssue } from './useEventPushIssuesStore';

const A = 'https://a.example';
const B = 'https://b.example';

const key = (sequence: number): EventKey => ({
  collection: 2,
  identity: 'identity',
  signedBy: { keyType: 1, key: new Uint8Array([1, 2, 3]).buffer },
  sequence: BigInt(sequence),
});

const issue = (
  server: string,
  sequence: number,
  { errors = [], warnings = [] }: { errors?: string[]; warnings?: string[] },
): EventPushIssue => ({
  id: `${server} ${sequence}`,
  server,
  key: key(sequence),
  errors,
  warnings,
  firstSeen: 0,
  lastSeen: 0,
});

beforeEach(() => jest.clearAllMocks());

const titles = (mock: jest.Mock) => mock.mock.calls.map(([title]) => title);

describe('showPushIssueToasts', () => {
  it('shows nothing for no issues', () => {
    showPushIssueToasts([]);
    expect(mockToast.error).not.toHaveBeenCalled();
    expect(mockToast.warning).not.toHaveBeenCalled();
  });

  it('coalesces errors into one toast for one server', () => {
    showPushIssueToasts([
      issue(A, 1, { errors: ['bad'] }),
      issue(A, 2, { errors: ['bad'], warnings: ['dropped'] }),
    ]);
    expect(titles(mockToast.error)).toEqual(['2 events not saved']);
    expect(mockToast.warning).not.toHaveBeenCalled();
  });

  it('counts an event rejected by several servers once', () => {
    showPushIssueToasts([
      issue(A, 1, { errors: ['bad'] }),
      issue(B, 1, { errors: ['bad'] }),
    ]);
    expect(titles(mockToast.error)).toEqual(['1 event not saved']);
  });

  it('gives errors and warnings a toast each', () => {
    showPushIssueToasts([
      issue(A, 1, { errors: ['bad'] }),
      issue(B, 2, { warnings: ['dropped'] }),
    ]);
    expect(titles(mockToast.error)).toEqual(['1 event not saved']);
    expect(titles(mockToast.warning)).toEqual([
      '1 event saved without content',
    ]);
  });

  it('shows a toast that opens the server list when pressed', () => {
    showPushIssueToasts([issue(A, 1, { errors: ['bad'] })]);

    const [, options] = mockToast.error.mock.calls[0];
    options.onPress();
    expect(mockNavigate).toHaveBeenCalledWith('/settings/sync-events');
  });
});
