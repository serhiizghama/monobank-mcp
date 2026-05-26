import type { ClientInfo, ExchangeRate, StatementItem } from '../types/monobank.js';
import { dedup } from '../cache/dedup.js';
import { apiFetch } from './base.js';
import { withRetry } from './retry.js';

export class PersonalClient {
  constructor(private readonly token: string) {}

  private headers(): Record<string, string> {
    return { 'X-Token': this.token };
  }

  async getClientInfo(): Promise<ClientInfo> {
    return dedup('client-info', () =>
      withRetry(() =>
        apiFetch<ClientInfo>('/personal/client-info', {
          headers: this.headers(),
        }),
      ),
    );
  }

  async getStatement(
    accountId: string,
    from: number,
    to?: number,
  ): Promise<StatementItem[]> {
    const path = to
      ? `/personal/statement/${accountId}/${from}/${to}`
      : `/personal/statement/${accountId}/${from}`;
    return dedup(`statement:${path}`, () =>
      withRetry(() =>
        apiFetch<StatementItem[]>(path, { headers: this.headers() }),
      ),
    );
  }

  async setWebhook(url: string): Promise<void> {
    await withRetry(() =>
      apiFetch<void>('/personal/webhook', {
        method: 'POST',
        headers: this.headers(),
        body: { webHookUrl: url },
      }),
    );
  }

  async getExchangeRates(): Promise<ExchangeRate[]> {
    return dedup('exchange-rates', () =>
      withRetry(() => apiFetch<ExchangeRate[]>('/bank/currency')),
    );
  }
}
