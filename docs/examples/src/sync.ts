// Shown on docs/content/developer/examples.md under "Staying in sync".

import type { PolycentricClient } from '@polycentric/js-sdk';

export function liveSync(client: PolycentricClient) {
  // #region live-sync
  client.events.onPulled((identity) => {
    console.log('new events for', identity);
  });
  const stopLiveSync = client.startLiveSync();

  // later
  stopLiveSync();
  // #endregion live-sync
}

export function reportPushFailures(client: PolycentricClient) {
  // #region push-results
  client.events.onPushResults((results) => {
    for (const result of results) console.log(result);
  });
  // #endregion push-results
}
