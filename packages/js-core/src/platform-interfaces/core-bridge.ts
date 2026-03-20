import type { IPolycentricCore } from './runtime-core';

export interface ICoreBridge {
  initialize(): Promise<IPolycentricCore>;
  getCoreInstance(): IPolycentricCore;
  initialized(): boolean;
  supportedOnPlatform(): boolean;
}
