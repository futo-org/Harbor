/**
 * The tab side of the client worker: an `AsyncHarbor` whose calls, queries
 * and events travel over a BroadcastChannel to whichever tab's worker is
 * serving (see `web.ts`).
 */
import type {
  ChannelMessage,
  HandleRef,
  RemoteError,
} from '@polycentric/rs-core-wasm/client-worker-protocol';
import type { ClientEvent, ClientSnapshot, EventBundle } from '../bindings';
import type {
  AsyncCalls,
  AsyncHarbor,
  PendingEventRef,
  QueryObserver,
} from '../harbor';

type Pending = { resolve(value: unknown): void; reject(error: unknown): void };

/** An error thrown in the worker, keeping its `SdkError` tag. */
function fromRemote(error: RemoteError): Error {
  const e = new Error(error.message) as Error & { tag?: string };
  e.name = error.name;
  if (error.tag) e.tag = error.tag;
  return e;
}

export class RemoteHarbor {
  private readonly tab = crypto.randomUUID();
  private nextId = 0;
  private epoch: string | null = null;
  private readonly waiting: Array<() => void> = [];
  private readonly pending = new Map<string, Pending>();
  private readonly subscriptions = new Map<
    string,
    {
      message: Extract<ChannelMessage, { type: 'subscribe' }>;
      observer: QueryObserver;
    }
  >();
  private readonly watchers = new Set<(event: ClientEvent) => void>();

  constructor(private readonly channel: BroadcastChannel) {
    channel.onmessage = (event: MessageEvent<ChannelMessage>) =>
      this.onMessage(event.data);
    this.post({ type: 'hello' });
  }

  /** Resolves once a worker is serving. */
  ready(): Promise<void> {
    if (this.epoch) return Promise.resolve();
    return new Promise((resolve) => this.waiting.push(resolve));
  }

  private post(message: ChannelMessage): void {
    this.channel.postMessage(message);
  }

  private onMessage(message: ChannelMessage): void {
    switch (message.type) {
      case 'ready': {
        if (message.epoch === this.epoch) return;
        const restarted = this.epoch !== null;
        this.epoch = message.epoch;
        if (restarted) {
          // A new worker: whatever the old one hadn't answered is lost.
          // Don't resend: calls aren't all safe to repeat.
          for (const [id, p] of this.pending) {
            this.pending.delete(id);
            p.reject(new Error('The Harbor client restarted; try again.'));
          }
        }
        for (const { message: subscribe } of this.subscriptions.values()) {
          this.post(subscribe);
        }
        for (const resolve of this.waiting.splice(0)) resolve();
        break;
      }
      case 'result': {
        const p = this.pending.get(message.id);
        if (!p) return;
        this.pending.delete(message.id);
        if (message.error) p.reject(fromRemote(message.error));
        else p.resolve(message.value);
        break;
      }
      case 'event':
        for (const watcher of this.watchers) watcher(message.event);
        break;
      case 'query': {
        const sub = this.subscriptions.get(message.sub);
        if (!sub) return;
        if (message.next) sub.observer.next(message.next);
        else if (message.error !== undefined) sub.observer.error(message.error);
        else if (message.complete) sub.observer.complete();
        break;
      }
      default:
        break;
    }
  }

  async call(method: string, args: unknown[]): Promise<unknown> {
    await this.ready();
    const id = `${this.tab}:${this.nextId++}`;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.post({ type: 'call', id, method, args });
    });
  }

  /** This client as an `AsyncHarbor`. */
  harbor(): AsyncHarbor {
    const special: Omit<AsyncHarbor, keyof AsyncCalls> = {
      snapshot: () => this.call('snapshot', []) as Promise<ClientSnapshot>,
      watch: (listener) => {
        this.watchers.add(listener);
        return () => this.watchers.delete(listener);
      },
      query: (queryKey, query, opts) => ({
        subscribe: (observer) => {
          const sub = `${this.tab}:q${this.nextId++}`;
          const message = {
            type: 'subscribe' as const,
            sub,
            queryKey,
            query,
            opts,
          };
          this.subscriptions.set(sub, { message, observer });
          if (this.epoch) this.post(message);
          return () => {
            this.subscriptions.delete(sub);
            this.post({ type: 'unsubscribe', sub });
          };
        },
      }),
      prepareEvent: async (content, collection) => {
        const prepared = (await this.call('prepareEvent', [
          content,
          collection,
        ])) as HandleRef & Omit<PendingEventRef, 'handle'>;
        return {
          bundle: prepared.bundle,
          key: prepared.key,
          handle: { __handle: prepared.__handle } satisfies HandleRef,
        };
      },
      commitEvent: async (event) => {
        const bundle = (await this.call('commitEvent', [
          event.handle,
        ])) as EventBundle;
        this.post({
          type: 'release',
          handle: (event.handle as HandleRef).__handle,
        });
        return bundle;
      },
    };
    return new Proxy(special as AsyncHarbor, {
      get: (target, method: string) => {
        if (method in target) return target[method as keyof typeof target];
        if (method === 'then') return undefined;
        return (...args: unknown[]) => this.call(method, args);
      },
    });
  }
}
