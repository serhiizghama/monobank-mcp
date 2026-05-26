import type { ClientInfo, ExchangeRate, StatementItem } from '../types/monobank.js';
import { dedup } from '../cache/dedup.js';
import { apiFetch } from './base.js';
import { withRetry } from './retry.js';
import { type SigningConfig, signRequest } from './signing.js';

export interface CorpSettings {
  pubkey: string;
  name: string;
  permission: string;
  logo: string;
  webhook: string | null;
}

export class CorporateClient {
  private readonly signingConfig: SigningConfig;

  constructor(keyId: string, privateKeyPem: string) {
    this.signingConfig = { keyId, privateKeyPem };
  }

  private userHeaders(path: string, requestId: string): Record<string, string> {
    return {
      ...signRequest(this.signingConfig, path, requestId),
      'X-Request-Id': requestId,
    };
  }

  private corpHeaders(path: string): Record<string, string> {
    return signRequest(this.signingConfig, path, '');
  }

  // --- Per-user endpoints (require requestId from auth flow) ---

  async getClientInfo(requestId: string): Promise<ClientInfo> {
    const path = '/personal/client-info';
    return dedup(`corp:client-info:${requestId}`, () =>
      withRetry(() =>
        apiFetch<ClientInfo>(path, { headers: this.userHeaders(path, requestId) }),
      ),
    );
  }

  async getStatement(
    requestId: string,
    accountId: string,
    from: number,
    to?: number,
  ): Promise<StatementItem[]> {
    const path = to
      ? `/personal/statement/${accountId}/${from}/${to}`
      : `/personal/statement/${accountId}/${from}`;
    return dedup(`corp:statement:${path}:${requestId}`, () =>
      withRetry(() =>
        apiFetch<StatementItem[]>(path, { headers: this.userHeaders(path, requestId) }),
      ),
    );
  }

  // --- Auth flow endpoints ---

  async initiateAuthorization(
    callbackUrl: string,
    permissions: string = 'sp',
  ): Promise<{ tokenRequestId: string; acceptUrl: string }> {
    const path = '/personal/auth/request';
    const sigHeaders = signRequest(this.signingConfig, path, permissions);
    return withRetry(() =>
      apiFetch(path, {
        method: 'POST',
        headers: {
          ...sigHeaders,
          'X-Callback': callbackUrl,
          'X-Permissions': permissions,
        },
      }),
    );
  }

  async checkAuthorization(
    requestId: string,
  ): Promise<{ status: string }> {
    const path = '/personal/auth/request';
    const sigHeaders = signRequest(this.signingConfig, path, requestId);
    return withRetry(() =>
      apiFetch(path, {
        headers: {
          ...sigHeaders,
          'X-Request-Id': requestId,
        },
      }),
    );
  }

  // --- Corp-level endpoints (no user context) ---

  async getCorpSettings(): Promise<CorpSettings> {
    const path = '/personal/corp/settings';
    return withRetry(() =>
      apiFetch<CorpSettings>(path, { headers: this.corpHeaders(path) }),
    );
  }

  async setCorpWebhook(url: string): Promise<void> {
    const path = '/personal/corp/webhook';
    await withRetry(() =>
      apiFetch<void>(path, {
        method: 'POST',
        headers: this.corpHeaders(path),
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
