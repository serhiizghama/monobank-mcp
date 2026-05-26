import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { TtlCache } from '../cache/ttl-cache.js';
import type { PersonalClient } from '../client/personal.js';
import { type ExchangeRate, CURRENCY_SYMBOLS } from '../types/monobank.js';

const CACHE_TTL_SECONDS = 300; // 5 minutes — Monobank updates rates every 5 min

export function registerCurrencyTools(
  server: McpServer,
  client: PersonalClient,
  cache: TtlCache,
): void {
  server.registerTool(
    'get_exchange_rates',
    {
      title: 'Get Exchange Rates',
      description:
        'Get current Monobank exchange rates for UAH and 100+ currency pairs. Public endpoint, no auth required, cached for 5 minutes. Use for currency conversion or checking current rates. Note: Monobank provides only current rates, not historical. Returns array of currency pairs with buy rate, sell rate (or cross rate for non-major pairs), and last updated timestamp.',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async () => {
      try {
        const cacheKey = 'exchange-rates';
        const cached = cache.get<ExchangeRate[]>(cacheKey);
        if (cached) {
          return { content: [{ type: 'text' as const, text: formatRates(cached) }] };
        }

        const rates = await client.getExchangeRates();
        cache.set(cacheKey, rates, CACHE_TTL_SECONDS);

        return { content: [{ type: 'text' as const, text: formatRates(rates) }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: 'text' as const, text: `Error fetching exchange rates: ${message}` }],
          isError: true,
        };
      }
    },
  );
}

function formatRates(rates: ExchangeRate[]): string {
  const formatted = rates.map((r) => {
    const from = CURRENCY_SYMBOLS[r.currencyCodeA] ?? r.currencyCodeA;
    const to = CURRENCY_SYMBOLS[r.currencyCodeB] ?? r.currencyCodeB;
    const result: Record<string, unknown> = {
      pair: `${from}/${to}`,
      date: new Date(r.date * 1000).toISOString(),
    };
    if (r.rateBuy != null) result.buy = r.rateBuy;
    if (r.rateSell != null) result.sell = r.rateSell;
    if (r.rateCross != null) result.cross = r.rateCross;
    return result;
  });
  return JSON.stringify(formatted, null, 2);
}
