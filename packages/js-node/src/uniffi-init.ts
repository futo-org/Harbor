import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import initAsync from '@polycentric/rs-core-uniffi-web/generated/wasm-bindgen';
import polycentricCoreModule from '@polycentric/rs-core-uniffi-web/generated';
import { PolycentricCore } from '@polycentric/rs-core-uniffi-web/generated';

let initPromise: Promise<void> | null = null;

export async function uniffiInitAsync(): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const wasmUrl = import.meta.resolve(
      '@polycentric/rs-core-uniffi-web/generated/wasm-bindgen/index_bg.wasm',
    );
    const wasmBytes = await readFile(fileURLToPath(wasmUrl));
    await initAsync({ module_or_path: wasmBytes });
    polycentricCoreModule.initialize();
  })();
  return initPromise;
}

export { PolycentricCore };
