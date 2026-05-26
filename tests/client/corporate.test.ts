import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import { CorporateClient } from '../../src/client/corporate.js';

const KEY_PAIR = generateKeyPairSync('ec', {
  namedCurve: 'secp256k1',
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'sec1', format: 'pem' },
});

function mockFetchOk(data?: unknown) {
  const body = data ? JSON.stringify(data) : '';
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true, status: 200, headers: new Headers(),
    text: vi.fn().mockResolvedValue(body),
  }));
}

function lastFetchCall() {
  const calls = (fetch as ReturnType<typeof vi.fn>).mock.calls;
  return { url: calls[0]![0] as string, init: calls[0]![1] as RequestInit };
}

describe('CorporateClient', () => {
  let client: CorporateClient;

  beforeEach(() => {
    vi.unstubAllGlobals();
    client = new CorporateClient('test-key-id', KEY_PAIR.privateKey);
  });

  describe('per-user endpoints', () => {
    it('getClientInfo sends X-Key-Id, X-Time, X-Sign, X-Request-Id headers', async () => {
      mockFetchOk({ clientId: 'x', name: 'Test', webHookUrl: '', permissions: '', accounts: [], jars: [] });
      await client.getClientInfo('user-token');
      const { init } = lastFetchCall();
      const headers = init.headers as Record<string, string>;
      expect(headers['X-Key-Id']).toBe('test-key-id');
      expect(headers['X-Time']).toBeDefined();
      expect(headers['X-Sign']).toBeDefined();
      expect(headers['X-Request-Id']).toBe('user-token');
    });

    it('getStatement builds correct URL path', async () => {
      mockFetchOk([]);
      await client.getStatement('req-id', 'acc1', 1700000000, 1700100000);
      const { url } = lastFetchCall();
      expect(url).toBe('https://api.monobank.ua/personal/statement/acc1/1700000000/1700100000');
    });

    it('getStatement omits to when undefined', async () => {
      mockFetchOk([]);
      await client.getStatement('req-id', 'acc1', 1700000000);
      const { url } = lastFetchCall();
      expect(url).toBe('https://api.monobank.ua/personal/statement/acc1/1700000000');
    });
  });

  describe('auth flow', () => {
    it('initiateAuthorization sends X-Callback and X-Permissions as headers', async () => {
      mockFetchOk({ tokenRequestId: 'tok123', acceptUrl: 'https://mono.ua/auth' });
      const result = await client.initiateAuthorization('https://my.app/cb', 'sp');
      expect(result.tokenRequestId).toBe('tok123');
      expect(result.acceptUrl).toBe('https://mono.ua/auth');

      const { url, init } = lastFetchCall();
      expect(url).toBe('https://api.monobank.ua/personal/auth/request');
      expect(init.method).toBe('POST');
      const headers = init.headers as Record<string, string>;
      expect(headers['X-Callback']).toBe('https://my.app/cb');
      expect(headers['X-Permissions']).toBe('sp');
    });

    it('checkAuthorization uses GET /personal/auth/request with X-Request-Id', async () => {
      mockFetchOk({ status: 'approved' });
      const result = await client.checkAuthorization('req-123');
      expect(result.status).toBe('approved');

      const { url, init } = lastFetchCall();
      expect(url).toBe('https://api.monobank.ua/personal/auth/request');
      expect(init.method ?? 'GET').toBe('GET');
      const headers = init.headers as Record<string, string>;
      expect(headers['X-Request-Id']).toBe('req-123');
    });
  });

  describe('corp-level endpoints', () => {
    it('getCorpSettings calls /personal/corp/settings without X-Request-Id', async () => {
      mockFetchOk({ pubkey: 'pk', name: 'App', permission: 'sp', logo: '', webhook: null });
      const result = await client.getCorpSettings();
      expect(result.name).toBe('App');

      const { url, init } = lastFetchCall();
      expect(url).toBe('https://api.monobank.ua/personal/corp/settings');
      const headers = init.headers as Record<string, string>;
      expect(headers['X-Key-Id']).toBe('test-key-id');
      expect(headers['X-Request-Id']).toBeUndefined();
    });

    it('setCorpWebhook sends POST with webHookUrl body', async () => {
      mockFetchOk();
      await client.setCorpWebhook('https://my.app/hook');
      const { url, init } = lastFetchCall();
      expect(url).toBe('https://api.monobank.ua/personal/corp/webhook');
      expect(init.method).toBe('POST');
      expect(init.body).toBe('{"webHookUrl":"https://my.app/hook"}');
    });
  });

  describe('public endpoints', () => {
    it('getExchangeRates calls /bank/currency', async () => {
      mockFetchOk([{ currencyCodeA: 840, currencyCodeB: 980, date: 1, rateBuy: 37 }]);
      const rates = await client.getExchangeRates();
      expect(rates).toHaveLength(1);
      const { url } = lastFetchCall();
      expect(url).toBe('https://api.monobank.ua/bank/currency');
    });
  });
});
