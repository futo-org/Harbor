import { requireIdentity, useAuthGateStore, withIdentity } from './authGate';

beforeEach(() => {
  useAuthGateStore.setState({ hasIdentity: false, visible: false });
});

describe('requireIdentity', () => {
  it('resolves without prompting when signed in', async () => {
    useAuthGateStore.setState({ hasIdentity: true });
    await expect(requireIdentity()).resolves.toBeUndefined();
    expect(useAuthGateStore.getState().visible).toBe(false);
  });

  it('prompts and rejects when signed out', async () => {
    const gate = requireIdentity();
    expect(useAuthGateStore.getState().visible).toBe(true);
    await expect(gate).rejects.toBeUndefined();
  });
});

describe('withIdentity', () => {
  it('runs the action when signed in', async () => {
    useAuthGateStore.setState({ hasIdentity: true });
    const action = jest.fn();
    withIdentity(action);
    await Promise.resolve();
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('drops the action and prompts when signed out', async () => {
    const action = jest.fn();
    withIdentity(action);
    await Promise.resolve();
    expect(action).not.toHaveBeenCalled();
    expect(useAuthGateStore.getState().visible).toBe(true);
  });
});
