import { checkForUpdate, updateManifestUrl } from './checkForUpdate';
import { useUpdateStore } from './hooks/useUpdateStore';

jest.mock('expo-application', () => ({
  applicationId: 'org.futo.polycentric',
  nativeBuildVersion: '57',
}));

const mockExtra: { variant?: string; distribution?: string } = {
  variant: 'production',
};
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    get expoConfig() {
      return { extra: mockExtra };
    },
  },
}));

jest.mock('@/src/common/util/platform', () => ({
  isWeb: false,
  isIOS: false,
  isAndroid: true,
}));

const mockToastError = jest.fn();
const mockToastSuccess = jest.fn();
jest.mock('@/src/common/components/toast', () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
    success: (...args: unknown[]) => mockToastSuccess(...args),
  },
}));

const MANIFEST = {
  package: 'org.futo.polycentric',
  channel: 'production',
  versionName: '2.13.0',
  versionCode: 58,
  url: 'https://static.harbor.social/apk/production/harbor-v2.13.0-58.apk',
  sha256: 'abc',
  notes: 'Fixes',
  publishedAt: '2026-08-12T00:00:00Z',
};

function mockFetch(body: unknown, ok = true) {
  const fn = jest.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 500,
    json: () => Promise.resolve(body),
  });
  global.fetch = fn as unknown as typeof fetch;
  return fn;
}

describe('checkForUpdate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockExtra.variant = 'production';
    mockExtra.distribution = 'apk';
    useUpdateStore.setState({
      skippedVersionCode: null,
      available: null,
      sheetOpen: false,
      phase: 'idle',
      progress: null,
      error: null,
    });
  });

  it('offers a newer versionCode and opens the sheet', async () => {
    mockFetch(MANIFEST);
    await checkForUpdate({ manual: false });

    const state = useUpdateStore.getState();
    expect(state.available?.versionCode).toBe(58);
    expect(state.sheetOpen).toBe(true);
  });

  it('does not offer an equal or older versionCode', async () => {
    mockFetch({ ...MANIFEST, versionCode: 57 });
    await checkForUpdate({ manual: false });
    expect(useUpdateStore.getState().available).toBeNull();

    mockFetch({ ...MANIFEST, versionCode: 56 });
    await checkForUpdate({ manual: true });
    expect(useUpdateStore.getState().available).toBeNull();
    expect(mockToastSuccess).toHaveBeenCalled();
  });

  it('never checks in store-distributed builds', async () => {
    mockExtra.distribution = 'store';

    const fetchFn = mockFetch(MANIFEST);
    await checkForUpdate({ manual: false });
    await checkForUpdate({ manual: true });
    expect(fetchFn).not.toHaveBeenCalled();
    expect(useUpdateStore.getState().available).toBeNull();
  });

  it('rejects a manifest for a different package', async () => {
    mockFetch({ ...MANIFEST, package: 'org.futo.polycentric.staging' });
    await checkForUpdate({ manual: false });
    expect(useUpdateStore.getState().available).toBeNull();
  });

  it('rejects a malformed manifest and surfaces manual errors', async () => {
    mockFetch({ nonsense: true });
    await checkForUpdate({ manual: true });
    expect(useUpdateStore.getState().available).toBeNull();
    expect(mockToastError).toHaveBeenCalled();
  });

  it('suppresses a skipped version on auto checks but not manual ones', async () => {
    useUpdateStore.setState({ skippedVersionCode: 58 });

    mockFetch(MANIFEST);
    await checkForUpdate({ manual: false });
    expect(useUpdateStore.getState().available).toBeNull();

    mockFetch(MANIFEST);
    await checkForUpdate({ manual: true });
    expect(useUpdateStore.getState().available?.versionCode).toBe(58);
  });
});

describe('updateManifestUrl', () => {
  it('selects the feed for the baked variant', () => {
    mockExtra.variant = 'staging';
    expect(updateManifestUrl()).toMatch(/\/apk\/staging\/latest\.json$/);

    mockExtra.variant = 'production';
    expect(updateManifestUrl()).toMatch(/\/apk\/production\/latest\.json$/);
  });
});
