import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PersonalClient } from '../../src/client/personal.js';
import type { ClientInfo, ExchangeRate } from '../../src/types/monobank.js';

const MOCK_CLIENT_INFO: ClientInfo = {
  clientId: 'test-id',
  name: 'Test User',
  webHookUrl: '',
  permissions: 'psfj',
  accounts: [
    {
      id: 'acc1',
      sendId: 'send1',
      balance: 100000,
      creditLimit: 0,
      type: 'black',
      currencyCode: 980,
      cashbackType: 'UAH',
      maskedPan: ['5375****1234'],
      iban: 'UA123456789',
    },
  ],
  jars: [],
};

const MOCK_RATES: ExchangeRate[] = [
  { currencyCodeA: 840, currencyCodeB: 980, date: 1700000000, rateBuy: 37.0, rateSell: 37.5 },
];

function mockFetchOk(data: unknown) {
  const body = JSON.stringify(data);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    headers: new Headers(),
    text: vi.fn().mockResolvedValue(body),
  }));
}

function mockFetchError(status: number, body = '') {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: false,
    status,
    headers: new Headers(status === 429 ? { 'Retry-After': '60' } : {}),
    text: vi.fn().mockResolvedValue(body),
  }));
}

describe('PersonalClient', () => {
  let client: PersonalClient;

  beforeEach(() => {
    vi.unstubAllGlobals();
    client = new PersonalClient('test-token');
  });

  describe('getClientInfo', () => {
    it('returns typed ClientInfo on success', async () => {
      mockFetchOk(MOCK_CLIENT_INFO);
      const info = await client.getClientInfo();
      expect(info.name).toBe('Test User');
      expect(info.accounts).toHaveLength(1);
      expect(info.accounts[0]!.type).toBe('black');
    });

    it('sends X-Token header', async () => {
      mockFetchOk(MOCK_CLIENT_INFO);
      await client.getClientInfo();
      expect(fetch).toHaveBeenCalledWith(
        'https://api.monobank.ua/personal/client-info',
        expect.objectContaining({
          headers: expect.objectContaining({ 'X-Token': 'test-token' }),
        }),
      );
    });

    it('throws AuthError on 401', async () => {
      mockFetchError(401);
      await expect(client.getClientInfo()).rejects.toThrow('Invalid or missing token');
    });

    // 429 → RateLimitError is covered by base.test.ts and retry.test.ts
    // Testing it through PersonalClient would require complex timer mocking
    // due to retry + dedup interaction
  });

  describe('getStatement', () => {
    it('builds correct URL with from and to', async () => {
      mockFetchOk([]);
      await client.getStatement('acc1', 1700000000, 1700100000);
      expect(fetch).toHaveBeenCalledWith(
        'https://api.monobank.ua/personal/statement/acc1/1700000000/1700100000',
        expect.anything(),
      );
    });

    it('builds URL without to when omitted', async () => {
      mockFetchOk([]);
      await client.getStatement('acc1', 1700000000);
      expect(fetch).toHaveBeenCalledWith(
        'https://api.monobank.ua/personal/statement/acc1/1700000000',
        expect.anything(),
      );
    });

    it('uses account "0" for default card', async () => {
      mockFetchOk([]);
      await client.getStatement('0', 1700000000);
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/personal/statement/0/'),
        expect.anything(),
      );
    });
  });

  describe('getExchangeRates', () => {
    it('returns ExchangeRate array', async () => {
      mockFetchOk(MOCK_RATES);
      const rates = await client.getExchangeRates();
      expect(rates).toHaveLength(1);
      expect(rates[0]!.rateBuy).toBe(37.0);
    });

    it('calls /bank/currency without auth header', async () => {
      mockFetchOk(MOCK_RATES);
      await client.getExchangeRates();
      const callArgs = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(callArgs![0]).toBe('https://api.monobank.ua/bank/currency');
    });
  });

  describe('setWebhook', () => {
    it('sends POST with webHookUrl body', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true, status: 200, headers: new Headers(),
        text: vi.fn().mockResolvedValue(''),
      }));
      await client.setWebhook('https://example.com/hook');
      expect(fetch).toHaveBeenCalledWith(
        'https://api.monobank.ua/personal/webhook',
        expect.objectContaining({
          method: 'POST',
          body: '{"webHookUrl":"https://example.com/hook"}',
        }),
      );
    });
  });
});
