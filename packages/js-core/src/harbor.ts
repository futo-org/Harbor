/**
 * The rs-core client as js-core sees it: every call asynchronous, so the
 * client can live in-process (React Native's JSI module, wasm under Node)
 * or in a worker that every browser tab shares (see `hosts/web.ts`).
 */
import type {
  ClientEvent,
  ClientSnapshot,
  Content,
  EventBundle,
  EventKey,
  HarborClientLike,
  PendingEventLike,
  Query,
  QueryOpts,
  QueryResult,
} from './bindings';

/** Receives a query's results. */
export interface QueryObserver {
  next(result: QueryResult): void;
  error(message: string): void;
  complete(): void;
}

/** A running query. Subscribing starts delivery; the result stops it. */
export interface QueryStream {
  subscribe(observer: QueryObserver): () => void;
}

/**
 * A signed event that isn't stored yet. Read `bundle`/`key` freely; only
 * rs-core holds its bytes. Commit it with `commitEvent`.
 */
export interface PendingEventRef {
  readonly bundle: EventBundle;
  readonly key: EventKey;
  /** Opaque to callers: the object (in-process) or handle (worker). */
  readonly handle: unknown;
}

/** Calls that need more than a plain async forward. */
type Special =
  | 'fetchQuery'
  | 'addListener'
  | 'removeListener'
  | 'prepareEvent'
  | 'commitEvent'
  | 'snapshot';

type Plain = Omit<HarborClientLike, Special>;

/** `HarborClient` with every plain call returning a promise. */
export type AsyncCalls = {
  [K in keyof Plain]: Plain[K] extends (...args: infer A) => infer R
    ? (...args: A) => Promise<Awaited<R>>
    : never;
};

export type AsyncHarbor = AsyncCalls & {
  snapshot(): Promise<ClientSnapshot>;
  /** Receive client events until the returned function is called. */
  watch(listener: (event: ClientEvent) => void): () => void;
  query(
    queryKey: string[] | undefined,
    query: Query,
    opts: QueryOpts | undefined,
  ): QueryStream;
  prepareEvent(content: Content, collection: number): Promise<PendingEventRef>;
  commitEvent(event: PendingEventRef): Promise<EventBundle>;
};

/** An in-process client as an [`AsyncHarbor`]. */
export function localHarbor(client: HarborClientLike): AsyncHarbor {
  const special: Omit<AsyncHarbor, keyof AsyncCalls> = {
    snapshot: async () => client.snapshot(),
    watch(listener) {
      const id = client.addListener({ onEvent: listener });
      return () => client.removeListener(id);
    },
    query(queryKey, query, opts) {
      return {
        subscribe(observer) {
          const subscription = client
            .fetchQuery(queryKey, query, opts)
            .subscribe(observer);
          return () => subscription.unsubscribe();
        },
      };
    },
    async prepareEvent(content, collection) {
      const pending = await client.prepareEvent(content, collection);
      return { bundle: pending.bundle(), key: pending.key(), handle: pending };
    },
    commitEvent: (event) =>
      client.commitEvent(event.handle as PendingEventLike),
  };
  return new Proxy(special as AsyncHarbor, {
    get(target, method: string) {
      if (method in target) return target[method as keyof typeof target];
      const fn = (client as unknown as Record<string, unknown>)[method];
      if (typeof fn !== 'function') return undefined;
      return async (...args: unknown[]) =>
        (fn as (...a: unknown[]) => unknown).apply(client, args);
    },
  });
}
