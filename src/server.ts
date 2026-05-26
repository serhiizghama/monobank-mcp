import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TtlCache } from './cache/ttl-cache.js';
import { PersonalClient } from './client/personal.js';
import { registerAccountTools } from './tools/account.js';
import { registerCurrencyTools } from './tools/currency.js';
import { registerStatementTools } from './tools/statement.js';

export function createServer(): McpServer {
  const token = process.env.MONOBANK_TOKEN;
  if (!token) throw new Error('MONOBANK_TOKEN environment variable is required');

  const server = new McpServer(
    { name: 'monobank-mcp', version: '0.1.0' },
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

  return server;
}
