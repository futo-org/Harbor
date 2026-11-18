/// <reference path="./wasm.d.ts" />
// Bundler entrypoint, also exported as `./web` so web code can name it
// outright: Expo's server bundle resolves the `node` condition, which would
// otherwise pick the Node entrypoint. The generated loader takes the wasm as
// an argument because only the host can name the asset; Metro and the web
// bundlers rewrite this import to the URL they copied the staged file to.
import wasmSource from './generated/wasm/polycentric_core.wasm';
import { uniffiInitAsync as openWasmModule } from './generated/wasm/index';

export * from './generated/wasm/index';

/**
 * Fetch and initialize the wasm module from the URL the bundler gave it.
 * Await it once before using any binding.
 */
export function uniffiInitAsync(): Promise<void> {
  return openWasmModule(wasmSource);
}
