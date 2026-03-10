import type { polycentric, polycentric_ffi } from '../generated/protocol';

type FeedPage = {
  items: polycentric.ISignedEvent[];
  cursor: polycentric_ffi.ICursor | null;
};

export class FeedQuery {
  private _cursor: polycentric_ffi.ICursor | null = null;
  private _seen = new Set<string>();

  constructor(
    private readonly _fetchPage: (
      cursor: polycentric_ffi.ICursor | null
    ) => Promise<FeedPage>
  ) {}

  async read(): Promise<polycentric.ISignedEvent[]> {
    const { items, cursor } = await this._fetchPage(this._cursor);
    this._cursor = cursor;

    const unique = items.filter((item) => {
      const key = eventKey(item);
      if (!key || this._seen.has(key)) return false;
      this._seen.add(key);
      return true;
    });

    return unique;
  }

  get hasMore(): boolean {
    return this._cursor != null;
  }
}

function eventKey(signedEvent: polycentric.ISignedEvent): string | null {
  const bytes = signedEvent.event;
  if (!bytes || bytes.length === 0) return null;
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += (bytes[i] as number).toString(16).padStart(2, '0');
  }
  return hex;
}
