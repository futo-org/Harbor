import { PolycentricWasm } from '@polycentric/rs-core-wasm-browser';

export interface IWasmBridge {
  initialize(): Promise<PolycentricWasm>;
  getWasmInstance(): PolycentricWasm;
  initialized(): boolean;
  _wasmSupportedOnPlatform(): boolean;
}
