import init, { PolycentricWasm } from '@polycentric/rs-core-wasm-browser';
import { WasmError, IWasmBridge } from '@polycentric/js-core';

/** Global WASM singleton - only one instance is maintained per session */
let wasmInstance: PolycentricWasm | null = null;

export class BrowserWasmBridge implements IWasmBridge {
  public async initialize(): Promise<PolycentricWasm> {
    if (wasmInstance) {
      return wasmInstance;
    }

    await init();

    const core = new PolycentricWasm();

    try {
      core.initialize();
      wasmInstance = core;
      return core;
    } catch (error) {
      throw new WasmError(
        'WASM Bridge: Failed to initialize WASM core.',
        error,
      );
    }
  }

  public initialized(): boolean {
    return wasmInstance !== null;
  }

  public getWasmInstance(): PolycentricWasm {
    if (!wasmInstance) {
      throw new WasmError(
        'WASM Core not initialized. Call initializeWasm() first.',
      );
    }

    return wasmInstance;
  }

  public _wasmSupportedOnPlatform(): boolean {
    return (
      typeof WebAssembly === 'object' &&
      typeof WebAssembly.instantiateStreaming === 'function' &&
      typeof WebAssembly.compileStreaming === 'function'
    );
  }
}

/**
 * Kill the WASM instance.
 *
 * @internal
 * @example
 * ```typescript
 * // In test cleanup
 * __killWasmInstance();
 * ```
 */
export function __killWasmInstance() {
  // The garbage collector will clean this up better than you ever could.
  // GC is the guy she tells you not to worry about.
  wasmInstance = null;
}
