import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TtlCache } from './cache/ttl-cache.js';
import { PersonalClient } from './client/personal.js';
import { registerAccountTools } from './tools/account.js';
import { registerCurrencyTools } from './tools/currency.js';
import { registerJarTools } from './tools/jars.js';
import { registerStatementTools } from './tools/statement.js';
import { registerWebhookTools } from './tools/webhook.js';

export function createServer(): McpServer {
  const token = process.env.MONOBANK_TOKEN;
  if (!token) throw new Error('MONOBANK_TOKEN environment variable is required');

  const server = new McpServer(
    { name: 'monobank-mcp', version: '0.3.0' },
    {
      capabilities: {
        logging: {},
      },
      instructions:
        'Monobank personal banking MCP server. Provides access to Ukrainian bank account balances, ' +
        'transaction history (statements), currency exchange rates, savings jars, and webhook management. ' +
        'Rate limit: 1 request per 60 seconds for personal API endpoints (client-info, statement). ' +
        'Results are cached automatically. Use get_client_info first to discover available accounts.',
    },
  );

  const client = new PersonalClient(token);
  const cache = new TtlCache();

  registerAccountTools(server, client, cache);
  registerStatementTools(server, client, cache);
  registerCurrencyTools(server, client, cache);
  registerWebhookTools(server, client, cache);
  registerJarTools(server, client, cache);

  registerResources(server, client);
  registerPrompts(server);

  return server;
}

function registerResources(server: McpServer, client: PersonalClient): void {
  server.registerResource(
    'exchange-rates',
    'monobank://exchange-rates',
    {
      description: 'Current Monobank exchange rates for all currency pairs',
      mimeType: 'application/json',
    },
    async (uri) => {
      const rates = await client.getExchangeRates();
      return {
        contents: [{
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(rates, null, 2),
        }],
      };
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
