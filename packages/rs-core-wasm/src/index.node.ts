// Node entrypoint. The generated loader takes the wasm as an argument because
// only the host can name the asset; under Node the package can name its own
// staged file through its exports map.
import { uniffiInitAsync as openWasmModule } from './generated/wasm/index';

export * from './generated/wasm/index';

export function uniffiInitAsync(): Promise<void> {
  return openWasmModule(
    new URL(
      import.meta.resolve('@polycentric/rs-core-wasm/polycentric_core.wasm'),
    ),
  );
}
