import { PolycentricClient } from '../polycentric-client';
import { Event, Events, SignedEvent } from '../proto/polycentric';
import { ServerError } from '../utils';
import { Base64 } from 'js-base64';

export interface ResultEventsAndServerErrors {
  events: Events;
  errors: ServerError[];
}

export class FeedQuery {
  private readonly cursors: Map<string, Uint8Array> = new Map();
  private latestEvent?: Event;

  private readonly result: Set<string> = new Set();
  public hasMore = true;
  public errors: ServerError[] = [];

  constructor(
    _client: PolycentricClient,
    private readonly feedCallback: (
      cursors: Map<string, Uint8Array>,
      latestEvent?: Event,
    ) => Promise<ResultEventsAndServerErrors>,
  ) {}

  public async read(): Promise<SignedEvent[]> {
    let result = await this.feedCallback(this.cursors, this.latestEvent);
    this.errors = result.errors;

    let events = result.events.events.filter((signedEvent: SignedEvent) => {
      let event = Base64.fromUint8Array(signedEvent.event);
      return !this.result.has(event);
    });

    for (let signedEvent of events) {
      let event = Base64.fromUint8Array(signedEvent.event);
      this.result.add(event);
    }

    if (events.length > 0) {
      let latestSignedEvent = events[events.length - 1];
      this.latestEvent = Event.fromBinary(latestSignedEvent.event);
    }

    this.hasMore = result.events.events.length > 0;

    return events;
  }
}
