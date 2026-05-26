import type { ClientInfo, ExchangeRate, StatementItem } from '../types/monobank.js';
import { apiFetch } from './base.js';

export class PersonalClient {
  constructor(private readonly token: string) {}

  private headers(): Record<string, string> {
    return { 'X-Token': this.token };
  }

  async getClientInfo(): Promise<ClientInfo> {
    return apiFetch<ClientInfo>('/personal/client-info', {
      headers: this.headers(),
    });
  }

  async getStatement(
    accountId: string,
    from: number,
    to?: number,
  ): Promise<StatementItem[]> {
    const path = to
      ? `/personal/statement/${accountId}/${from}/${to}`
      : `/personal/statement/${accountId}/${from}`;
    return apiFetch<StatementItem[]>(path, { headers: this.headers() });
  }

  async setWebhook(url: string): Promise<void> {
    await apiFetch<void>('/personal/webhook', {
      method: 'POST',
      headers: this.headers(),
      body: { webHookUrl: url },
    });
  }

  async getExchangeRates(): Promise<ExchangeRate[]> {
    return apiFetch<ExchangeRate[]>('/bank/currency');
  }
}
