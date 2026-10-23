import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
export type SealedCredential = {
  ciphertext: string;
  nonce: string;
  authTag: string;
  keyVersion: string;
};
export class CredentialError extends Error {
  constructor() {
    super('Credential could not be read securely');
    this.name = 'CredentialError';
  }
}
export function credentialKey(encoded: string): Buffer {
  const key = Buffer.from(encoded, 'base64');
  if (key.length !== 32 || key.toString('base64') !== encoded) throw new CredentialError();
  return key;
}
export function sealCredential(
  value: string,
  key: Buffer,
  keyVersion: string,
  owner: string,
  connectionId: string,
): SealedCredential {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(Buffer.from(JSON.stringify([owner, connectionId, keyVersion])));
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return {
    ciphertext: encrypted.toString('base64'),
    nonce: nonce.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
    keyVersion,
  };
}
export function openCredential(
  sealed: SealedCredential,
  key: Buffer,
  keyVersion: string,
  owner: string,
  connectionId: string,
): string {
  try {
    if (sealed.keyVersion !== keyVersion) throw new CredentialError();
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(sealed.nonce, 'base64'));
    decipher.setAAD(Buffer.from(JSON.stringify([owner, connectionId, sealed.keyVersion])));
    decipher.setAuthTag(Buffer.from(sealed.authTag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(sealed.ciphertext, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    throw new CredentialError();
  }
}
