import { describe, expect, it } from 'vitest';
import { decodeStatusByServer, encodeStatusByServer } from './moderation';

describe('decodeStatusByServer', () => {
  it('decodes the JSON serverUrl -> bool map', () => {
    const data = new TextEncoder().encode(
      JSON.stringify({ 'http://a': true, 'http://b': false }),
    );

    expect(decodeStatusByServer(data)).toEqual(
      new Map([
        ['http://a', true],
        ['http://b', false],
      ]),
    );
  });

  it('decodes an empty payload to an empty map', () => {
    expect(decodeStatusByServer(new ArrayBuffer(0))).toEqual(new Map());
  });

  it('round-trips through encodeStatusByServer', () => {
    const statusByServer = new Map([
      ['http://a', true],
      ['http://b', false],
    ]);

    expect(decodeStatusByServer(encodeStatusByServer(statusByServer))).toEqual(
      statusByServer,
    );
  });
});
