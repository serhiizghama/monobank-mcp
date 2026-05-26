import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';

export interface SigningConfig {
  keyId: string;
  privateKeyPem: string;
}

export function signRequest(
  config: SigningConfig,
  requestPath: string,
  secondIngredient: string = '',
): Record<string, string> {
  const timestamp = Math.floor(Date.now() / 1000);
  const dataToSign = `${timestamp}${secondIngredient}${requestPath}`;

  const signer = createSign('SHA256');
  signer.update(dataToSign);
  const signature = signer.sign(config.privateKeyPem, 'base64');

  return {
    'X-Key-Id': config.keyId,
    'X-Time': timestamp.toString(),
    'X-Sign': signature,
  };
}

export function loadPrivateKey(): string {
  if (process.env.MONOBANK_PRIVATE_KEY_PEM) {
    return process.env.MONOBANK_PRIVATE_KEY_PEM.replace(/\\n/g, '\n');
  }
  const path = process.env.MONOBANK_PRIVATE_KEY_PATH;
  if (path) return readFileSync(path, 'utf-8');
  throw new Error('Corporate API requires MONOBANK_PRIVATE_KEY_PEM or MONOBANK_PRIVATE_KEY_PATH');
}
