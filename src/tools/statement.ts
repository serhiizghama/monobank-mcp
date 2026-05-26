import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { TtlCache } from '../cache/ttl-cache.js';
import type { PersonalClient } from '../client/personal.js';
import { AuthError, RateLimitError } from '../errors/index.js';
import { CURRENCY_SYMBOLS, formatAmount } from '../types/monobank.js';

const MAX_RANGE_SECONDS = 31 * 24 * 60 * 60; // 31 days

export function registerStatementTools(
  server: McpServer,
  client: PersonalClient,
  cache: TtlCache,
): void {
  server.registerTool(
    'get_statement',
    {
      title: 'Get Statement',
      description:
        'Get full transaction history for a specific date range (max 31 days). Use when you need transactions for a specific period. For recent activity use get_recent_transactions instead. Rate-limited: 1 request per 60 seconds in Personal mode. Returns list of transactions with time (ISO 8601), description, amount, balance, MCC code, hold status, and optional comment.',
      inputSchema: {
        account_id: z
          .string()
          .optional()
          .default('0')
          .describe("Account ID from get_client_info. Use '0' for the default (black) card"),
        from_date: z
          .string()
          .describe("Start date in ISO 8601 format (e.g. '2024-01-01') or Unix timestamp in seconds"),
        to_date: z
          .string()
          .optional()
          .describe('End date in ISO 8601 format. Defaults to now. Max range: 31 days'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(500)
          .optional()
          .default(50)
          .describe('Maximum number of transactions to return (default: 50, max: 500)'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ account_id, from_date, to_date, limit }) => {
      try {
        const from = parseTimestamp(from_date);
        const to = to_date ? parseTimestamp(to_date) : Math.floor(Date.now() / 1000);

        if (to - from > MAX_RANGE_SECONDS) {
          return {
            content: [{ type: 'text' as const, text: 'Error: Date range exceeds 31 days. Monobank limits statement queries to 31 days maximum.' }],
            isError: true,
          };
        }

        if (from > to) {
          return {
            content: [{ type: 'text' as const, text: 'Error: from_date must be before to_date.' }],
            isError: true,
          };
        }

        const cacheKey = `statement:${account_id}:${from}:${to}`;
        const cached = cache.get<ReturnType<typeof formatStatementItems>>(cacheKey);
        if (cached) {
          const sliced = cached.slice(0, limit);
          return { content: [{ type: 'text' as const, text: JSON.stringify(sliced, null, 2) }] };
        }

        const items = await client.getStatement(account_id, from, to);
        const formatted = formatStatementItems(items);
        cache.set(cacheKey, formatted, 59);

        const sliced = formatted.slice(0, limit);
        return {
          content: [{
            type: 'text' as const,
            text: sliced.length === 0
              ? 'No transactions in this period.'
              : JSON.stringify(sliced, null, 2),
          }],
        };
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.registerTool(
    'get_recent_transactions',
    {
      title: 'Get Recent Transactions',
      description:
        'Get the most recent transactions from an account going back N minutes. Use to check for new activity, monitor spending, or find a specific recent payment. Do not use for historical analysis over specific date ranges — use get_statement instead. Returns up to N most recent transactions with time, description, amount, balance, and MCC code.',
      inputSchema: {
        account_id: z.string().optional().default('0')
          .describe("Account ID. Use '0' for default card. Get IDs via get_client_info"),
        minutes: z.number().int().min(1).max(43200).optional().default(60)
          .describe('How many minutes back to look (default: 60, max: 43200 = 30 days)'),
        limit: z.number().int().min(1).max(100).optional().default(20)
          .describe('Max transactions to return (default: 20)'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ account_id, minutes, limit }) => {
      try {
        const to = Math.floor(Date.now() / 1000);
        const from = to - minutes * 60;

        const items = await client.getStatement(account_id, from, to);
        const formatted = formatStatementItems(items).slice(0, limit);

        return {
          content: [{
            type: 'text' as const,
            text: formatted.length === 0
              ? 'No transactions in this period.'
              : JSON.stringify(formatted, null, 2),
          }],
        };
      } catch (err) {
        return handleToolError(err);
      }
    },
  );
}

function parseTimestamp(value: string): number {
  const asNumber = Number(value);
  if (!isNaN(asNumber) && asNumber > 1_000_000_000 && asNumber < 10_000_000_000) {
    return Math.floor(asNumber);
  }
  const date = new Date(value);
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid date: "${value}". Use ISO 8601 format (e.g. "2024-01-01") or Unix timestamp in seconds.`);
  }
  return Math.floor(date.getTime() / 1000);
}

function formatStatementItems(items: { time: number; description: string; amount: number; currencyCode: number; balance: number; mcc: number; hold: boolean; comment?: string }[]) {
  return items.map((item) => ({
    time: new Date(item.time * 1000).toISOString(),
    description: item.description,
    amount: `${formatAmount(item.amount)} ${CURRENCY_SYMBOLS[item.currencyCode] ?? item.currencyCode}`,
    balance: formatAmount(item.balance),
    mcc: item.mcc,
    hold: item.hold,
    ...(item.comment ? { comment: item.comment } : {}),
  }));
}

function handleToolError(err: unknown) {
  if (err instanceof AuthError) {
    return {
      content: [{ type: 'text' as const, text: `Authentication failed: ${err.message}` }],
      isError: true,
    };
  }
  if (err instanceof RateLimitError) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Rate limit hit. Monobank allows 1 request per 60 seconds. Retry in ${err.retryAfterSeconds ?? 60}s.`,
        },
      ],
      isError: true,
    };
  }
  const message = err instanceof Error ? err.message : String(err);
  return {
    content: [{ type: 'text' as const, text: `Error: ${message}` }],
    isError: true,
  };
}
