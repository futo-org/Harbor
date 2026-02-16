import * as ProcessHandle from './process-handle';
import * as Synchronization from './synchronization';

describe('flood', () => {
  test('flood', async () => {
    const s1p1 = await ProcessHandle.createTestProcessHandle();
    await s1p1.addServer(ProcessHandle.TEST_SERVER);
    for (let i = 0; i < 1000; i++) {
      await s1p1.post(i.toString());
    }
    await Synchronization.backFillServers(s1p1, s1p1.system());
  });
});
