// Messages between tabs and the client worker (client-worker.ts). Types
// only; js-core's web host speaks the tab side.
import type {
  Application,
  ClientEvent,
  Query,
  QueryOpts,
  QueryResult,
} from './generated/wasm/index';

/** Sent by the leading tab to the worker it started. */
export type OpenRequest = {
  type: 'open';
  /** URL of the wasm module. */
  wasm: string;
  /** Database name. */
  name: string;
  /** BroadcastChannel the worker serves every tab on. */
  channel: string;
  seedServers: string[];
  application?: Application;
};

export type OpenResponse =
  | { type: 'opened' }
  | { type: 'failed'; error: RemoteError };

/** An error thrown in the worker. `tag` is the `SdkError` variant. */
export type RemoteError = { name: string; message: string; tag?: string };

/** What a call returns in place of an object it can't send (a pending event). */
export type HandleRef = { __handle: number };

/** Messages on the BroadcastChannel, both ways. */
export type ChannelMessage =
  // Tabs → worker
  | { type: 'hello' }
  | { type: 'call'; id: string; method: string; args: unknown[] }
  | { type: 'release'; handle: number }
  | {
      type: 'subscribe';
      sub: string;
      queryKey: string[] | undefined;
      query: Query;
      opts: QueryOpts | undefined;
    }
  | { type: 'unsubscribe'; sub: string }
  // Worker → tabs. `epoch` changes when a new worker takes over, which
  // drops anything the old one hadn't answered.
  | { type: 'ready'; epoch: string }
  | { type: 'result'; id: string; value?: unknown; error?: RemoteError }
  | { type: 'event'; event: ClientEvent }
  | {
      type: 'query';
      sub: string;
      next?: QueryResult;
      error?: string;
      complete?: true;
    };
