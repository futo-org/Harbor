// Written by plugins/grpc-api at build time.
declare module '@generated/grpc-api/default/api.json' {
  import type { ApiModel } from '@site/plugins/grpc-api/types';

  const model: ApiModel;
  export default model;
}
