import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createVerify, generateKeyPairSync } from 'node:crypto';
import { signRequest, loadPrivateKey } from '../../src/client/signing.js';
import type { SigningConfig } from '../../src/client/signing.js';

const KEY_PAIR = generateKeyPairSync('ec', {
  namedCurve: 'secp256k1',
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'sec1', format: 'pem' },
});

const config: SigningConfig = {
  keyId: 'test-key-id',
  privateKeyPem: KEY_PAIR.privateKey,
};

describe('signRequest', () => {
  it('returns X-Key-Id, X-Time, X-Sign headers', () => {
    const headers = signRequest(config, '/test/path', '');
    expect(headers['X-Key-Id']).toBe('test-key-id');
    expect(headers['X-Time']).toBeDefined();
    expect(headers['X-Sign']).toBeDefined();
  });

  it('X-Time is close to current unix timestamp', () => {
    const headers = signRequest(config, '/test', '');
    const signedTime = parseInt(headers['X-Time']!, 10);
    const now = Math.floor(Date.now() / 1000);
    expect(Math.abs(signedTime - now)).toBeLessThanOrEqual(1);
  });

  it('signature is valid base64', () => {
    const headers = signRequest(config, '/test', '');
    const decoded = Buffer.from(headers['X-Sign']!, 'base64');
    expect(decoded.length).toBeGreaterThan(0);
  });

  it('signature verifies with the public key', () => {
    const path = '/personal/client-info';
    const ingredient = 'test-request-id';
    const headers = signRequest(config, path, ingredient);

    const dataToSign = `${headers['X-Time']}${ingredient}${path}`;
    const verifier = createVerify('SHA256');
    verifier.update(dataToSign);
    const valid = verifier.verify(KEY_PAIR.publicKey, headers['X-Sign']!, 'base64');
    expect(valid).toBe(true);
  });

  it('uses different secondIngredient for different endpoints', () => {
    const authHeaders = signRequest(config, '/personal/auth/request', 'sp');
    const userHeaders = signRequest(config, '/personal/client-info', 'user-token-123');
    const corpHeaders = signRequest(config, '/personal/corp/settings', '');

    // All should produce valid signatures but with different data
    expect(authHeaders['X-Sign']).toBeDefined();
    expect(userHeaders['X-Sign']).toBeDefined();
    expect(corpHeaders['X-Sign']).toBeDefined();

    // Verify auth signature with permissions ingredient
    const verifier = createVerify('SHA256');
    verifier.update(`${authHeaders['X-Time']}sp/personal/auth/request`);
    expect(verifier.verify(KEY_PAIR.publicKey, authHeaders['X-Sign']!, 'base64')).toBe(true);
  });

  it('defaults secondIngredient to empty string', () => {
    const headers = signRequest(config, '/personal/corp/settings');
    const verifier = createVerify('SHA256');
    verifier.update(`${headers['X-Time']}/personal/corp/settings`);
    expect(verifier.verify(KEY_PAIR.publicKey, headers['X-Sign']!, 'base64')).toBe(true);
  });
});

describe('loadPrivateKey', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    delete process.env.MONOBANK_PRIVATE_KEY_PEM;
    delete process.env.MONOBANK_PRIVATE_KEY_PATH;
  });

  it('loads from MONOBANK_PRIVATE_KEY_PEM env var', () => {
    process.env.MONOBANK_PRIVATE_KEY_PEM = KEY_PAIR.privateKey.replace(/\n/g, '\\n');
    const key = loadPrivateKey();
    expect(key).toContain('BEGIN EC PRIVATE KEY');
  });

  it('throws when no key source configured', () => {
    expect(() => loadPrivateKey()).toThrow('Corporate API requires');
  });
});
