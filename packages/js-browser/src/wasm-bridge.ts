import {
  type ICoreBridge,
  type IPolycentricCore,
  WasmError,
} from '@polycentric/js-core';
import init, { PolycentricWasm } from '@polycentric/rs-core-wasm-browser';

/** Global WASM singleton - only one instance is maintained per session */
let wasmInstance: PolycentricWasm | null = null;

export type ModuleOrPath = Parameters<typeof init>[0];

export class BrowserWasmBridge implements ICoreBridge {
  constructor(private readonly moduleOrPath: ModuleOrPath) {}

  public async initialize(): Promise<IPolycentricCore> {
    if (wasmInstance) {
      return this.getCoreInstance();
    }

    await init(this.moduleOrPath);

    const core = new PolycentricWasm();

    try {
      core.initialize();
      wasmInstance = core;
      return this.getCoreInstance();
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

  public getCoreInstance(): IPolycentricCore {
    return this.getWasmInstance() as unknown as IPolycentricCore;
  }

  public getWasmInstance(): PolycentricWasm {
    if (!wasmInstance) {
      throw new WasmError(
        'WASM Core not initialized. Call initializeWasm() first.',
      );
    }

    return wasmInstance;
  }

  public supportedOnPlatform(): boolean {
    return this._wasmSupportedOnPlatform();
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
