import { polycentric, polycentric_ffi } from '../generated/protocol';

export function encodePublicKey(key: polycentric.IPublicKey): Uint8Array {
  return polycentric.PublicKey.encode(key).finish();
}

export function encodeProcess(process: polycentric.IProcess): Uint8Array {
  return polycentric.Process.encode(process).finish();
}

export function encodePointer(pointer: polycentric.IPointer): Uint8Array {
  return polycentric.Pointer.encode(pointer).finish();
}

export function encodeReference(ref: polycentric.IReference): Uint8Array {
  return polycentric.Reference.encode(ref).finish();
}

export function encodeServerFeedQuery(
  query: polycentric_ffi.IServerFeedQuery
): Uint8Array {
  return polycentric_ffi.ServerFeedQuery.encode(query).finish();
}

export function encodeSearchQuery(
  query: polycentric_ffi.ISearchQuery
): Uint8Array {
  return polycentric_ffi.SearchQuery.encode(query).finish();
}

export function encodeCursor(
  cursor: polycentric_ffi.ICursor | null
): Uint8Array {
  return polycentric_ffi.Cursor.encode(
    polycentric_ffi.Cursor.create(cursor ?? {})
  ).finish();
}

export function encodeEventCreationData(
  data: polycentric.IEventCreationData
): Uint8Array {
  return polycentric.EventCreationData.encode(data).finish();
}

export function encodeSignedEvent(event: polycentric.ISignedEvent): Uint8Array {
  return polycentric.SignedEvent.encode(event).finish();
}

export function encodeEvent(event: polycentric.IEvent): Uint8Array {
  return polycentric.Event.encode(event).finish();
}

export function encodeFeedQuery(query: polycentric_ffi.IFeedQuery): Uint8Array {
  return polycentric_ffi.FeedQuery.encode(query).finish();
}
