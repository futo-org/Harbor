import { expect, test, describe, afterEach } from 'vitest';
import { BrowserWasmBridge, __killWasmInstance } from '@polycentric/js-browser';
import { WasmError } from '@polycentric/js-core';
import wasmUrl from '@polycentric/rs-core-wasm-browser/polycentric_core_bg.wasm';

describe('WASM Initialization', () => {
  afterEach(() => {
    __killWasmInstance();
  });

  test('should initialize WASM successfully', async () => {
    const core = new BrowserWasmBridge(wasmUrl);
    expect(core).toBeDefined();
    expect(core._wasmSupportedOnPlatform()).toBe(true);
    expect(core.initialized()).toBe(false);
    await core.initialize();
    expect(core.initialized()).toBe(true);
    expect(core.getWasmInstance()).toBeDefined();
  });

  test('should handle multiple initialzations gracefully', async () => {
    const core = new BrowserWasmBridge(wasmUrl);
    await core.initialize();
    await core.initialize();
    expect(core.initialized()).toBe(true);
    expect(core.getWasmInstance()).toBeDefined();
  });

  test('should return the same instance on subsequent calls', async () => {
    const core = new BrowserWasmBridge(wasmUrl);
    await core.initialize();
    expect(core.getWasmInstance()).toBeDefined();
  });

  test('should return the same instance on multiple instantiations', async () => {
    const core1 = new BrowserWasmBridge(wasmUrl);
    const core2 = new BrowserWasmBridge(wasmUrl);
    await core1.initialize();
    await core2.initialize();
    expect(core1.getWasmInstance()).toBe(core2.getWasmInstance());
  });

  test('getWasmInstance should return the initialized instance', async () => {
    const core = new BrowserWasmBridge(wasmUrl);
    await core.initialize();
    const instance = core.getWasmInstance();
    expect(instance).toBeDefined();
  });

  test('getWasmInstance should throw if WASM is not initialized', () => {
    const core = new BrowserWasmBridge(wasmUrl);
    expect(() => core.getWasmInstance()).toThrow(WasmError);
  });
});
