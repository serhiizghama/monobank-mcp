import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TtlCache } from './cache/ttl-cache.js';
import { CorporateClient } from './client/corporate.js';
import { PersonalClient } from './client/personal.js';
import { apiFetch } from './client/base.js';
import { withRetry } from './client/retry.js';
import { loadPrivateKey } from './client/signing.js';
import { registerAccountTools } from './tools/account.js';
import { registerCorporateAuthTools } from './tools/corporate-auth.js';
import { registerCorporateSettingsTools } from './tools/corporate-settings.js';
import { registerCurrencyTools } from './tools/currency.js';
import { registerJarTools } from './tools/jars.js';
import { registerStatementTools } from './tools/statement.js';
import { registerWebhookTools } from './tools/webhook.js';

type AuthMode = 'personal' | 'corporate';

export function createServer(): McpServer {
  const mode = (process.env.MONOBANK_AUTH_MODE ?? 'personal') as AuthMode;

  const server = new McpServer(
    { name: 'monobank-mcp', version: '2.0.2' },
    {
      capabilities: {
        logging: {},
      },
      instructions:
        'Monobank banking MCP server. Provides access to Ukrainian bank account balances, ' +
        'transaction history (statements), currency exchange rates, savings jars, and webhook management. ' +
        (mode === 'personal'
          ? 'Rate limit: 1 request per 60 seconds for personal API endpoints (client-info, statement). '
          : 'Corporate mode: no rate limits. Per-user endpoints require a requestId from the auth flow. ') +
        'Results are cached automatically. Use get_client_info first to discover available accounts.',
    },
  );

  const cache = new TtlCache();

  if (mode === 'corporate') {
    const keyId = process.env.MONOBANK_KEY_ID;
    if (!keyId) throw new Error('MONOBANK_KEY_ID is required for corporate mode');
    const privateKeyPem = loadPrivateKey();
    const client = new CorporateClient(keyId, privateKeyPem);

    registerCorporateAuthTools(server, client);
    registerCorporateSettingsTools(server, client);
    registerCurrencyTools(server, client as never, cache);
  } else {
    const token = process.env.MONOBANK_TOKEN;
    if (!token) throw new Error('MONOBANK_TOKEN is required for personal mode');
    const client = new PersonalClient(token);

    registerAccountTools(server, client, cache);
    registerStatementTools(server, client, cache);
    registerCurrencyTools(server, client, cache);
    registerWebhookTools(server, client, cache);
    registerJarTools(server, client, cache);
  }

  registerResources(server, mode, cache);
  registerPrompts(server);

  return server;
}

function registerResources(server: McpServer, _mode: AuthMode, cache: TtlCache): void {
  server.registerResource(
    'exchange-rates',
    'monobank://exchange-rates',
    {
      description: 'Current Monobank exchange rates for all currency pairs',
      mimeType: 'application/json',
    },
    async (uri) => {
      const cacheKey = 'resource:exchange-rates';
      const cached = cache.get<string>(cacheKey);
      if (cached) {
        return { contents: [{ uri: uri.href, mimeType: 'application/json', text: cached }] };
      }

      const rates = await withRetry(() => apiFetch<unknown[]>('/bank/currency'));
      const text = JSON.stringify(rates, null, 2);
      cache.set(cacheKey, text, 300);
      return { contents: [{ uri: uri.href, mimeType: 'application/json', text }] };
    },
  );
}

function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    'spending-analysis',
    {
      title: 'Analyze Spending',
      description: 'Analyze spending patterns for a given time period',
      argsSchema: {
        period: z.enum(['week', 'month', 'quarter']).describe('Time period to analyze'),
        account_id: z.string().optional().describe('Specific account ID (optional, defaults to main card)'),
      },
    },
    async ({ period, account_id }) => ({
      messages: [{
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: `Analyze my spending for the last ${period}. ${
            account_id ? `Focus on account ${account_id}.` : 'Use the default card.'
          } Steps:\n1. Use get_statement to fetch transactions for the period\n2. Categorize transactions by MCC code\n3. Calculate totals per category\n4. Identify the largest expenses\n5. Note any unusual spending patterns`,
        },
      }],
    }),
  );
}
