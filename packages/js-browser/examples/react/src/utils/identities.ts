import type {
  KeyPair,
  PolycentricClient,
  PublicKey,
} from '@polycentric/js-core';
import { Base64 } from 'js-base64';

/**
 * Generates a unique identifier string for a given identity
 *
 * @param identity The public key representing the identity
 * @returns The identifier string
 */
export const Identifier = (identity: PublicKey) => {
  return Base64.fromUint8Array(identity.key).substring(0, 10);
};

const SELECTED_IDENTITY_ITEM = 'SELECTED_IDENTITY';

/**
 * Determines which identity the user has selected
 *
 * @param identities The current list of saved identities
 * @returns The identity the user has selected (or the first in the list, if none of the stored identities match the currently selected identity)
 */
export const currentSelectedIdentity = (identities: KeyPair[]): KeyPair => {
  if (!localStorage?.getItem) return identities[0];

  const selected = localStorage.getItem(SELECTED_IDENTITY_ITEM);
  const identitiesFiltered = identities.filter(
    (keyPair) => Identifier(keyPair.publicKey) === selected,
  );

  if (identitiesFiltered.length > 0) return identitiesFiltered[0];

  return identities[0];
};

/**
 * Switches the current identity, and stores the currently selected identity in local storage
 *
 * @param client The PolycentricClient object currently in use
 * @param identity The identity to switch to
 */
export const selectIdentity = async (
  client: PolycentricClient,
  identity: PublicKey,
) => {
  await client.switchKeyPair(identity);
  localStorage.setItem(SELECTED_IDENTITY_ITEM, Identifier(identity));
};
