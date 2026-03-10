import { expect, test, describe, afterEach } from 'vitest';
import { NodeWasmBridge, __killWasmInstance } from '@lib-polycentric/node';
import { WasmError } from '@polycentric/js-core';

describe('WASM Initialization', () => {
  afterEach(() => {
    __killWasmInstance();
  });

  test('should initialize WASM successfully', async () => {
    const core = new NodeWasmBridge();
    expect(core).toBeDefined();
    expect(core._wasmSupportedOnPlatform()).toBe(true);
    expect(core.initialized()).toBe(false);
    await core.initialize();
    expect(core.initialized()).toBe(true);
    expect(core.getWasmInstance()).toBeDefined();
  });

  test('should handle multiple initialzations gracefully', async () => {
    const core = new NodeWasmBridge();
    await core.initialize();
    await core.initialize();
    expect(core.initialized()).toBe(true);
    expect(core.getWasmInstance()).toBeDefined();
  });

  test('should return the same instance on subsequent calls', async () => {
    const core = new NodeWasmBridge();
    await core.initialize();
    expect(core.getWasmInstance()).toBeDefined();
  });

  test('should return the same instance on multiple instantiations', async () => {
    const core1 = new NodeWasmBridge();
    const core2 = new NodeWasmBridge();
    await core1.initialize();
    await core2.initialize();
    expect(core1.getWasmInstance()).toBe(core2.getWasmInstance());
  });

  test('getWasmInstance should return the initialized instance', async () => {
    const core = new NodeWasmBridge();
    await core.initialize();
    const instance = core.getWasmInstance();
    expect(instance).toBeDefined();
  });

  test('getWasmInstance should throw if WASM is not initialized', () => {
    const core = new NodeWasmBridge();
    expect(() => core.getWasmInstance()).toThrow(WasmError);
  });
});
