import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TtlCache } from '../../src/cache/ttl-cache.js';
import { PersonalClient } from '../../src/client/personal.js';
import { registerStatementTools } from '../../src/tools/statement.js';
import type { StatementItem } from '../../src/types/monobank.js';

const MOCK_ITEMS: StatementItem[] = [
  {
    id: 'tx1', time: 1716000000, description: 'Coffee Shop',
    mcc: 5812, originalMcc: 5812, amount: -8500, operationAmount: -8500,
    currencyCode: 980, commissionRate: 0, cashbackAmount: 85,
    balance: 150000, hold: false, comment: 'Morning latte',
  },
  {
    id: 'tx2', time: 1715990000, description: 'Salary',
    mcc: 0, originalMcc: 0, amount: 5000000, operationAmount: 5000000,
    currencyCode: 980, commissionRate: 0, cashbackAmount: 0,
    balance: 158500, hold: false,
  },
];

function mockFetchOk(data: unknown) {
  const body = JSON.stringify(data);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true, status: 200, headers: new Headers(),
    text: vi.fn().mockResolvedValue(body),
  }));
}

async function callTool(server: McpServer, name: string, args: Record<string, unknown> = {}) {
  const tools = (server as unknown as { _registeredTools: Record<string, unknown> })._registeredTools;
  return server.executeToolHandler(tools[name] as never, args, {} as never);
}

describe('get_statement tool', () => {
  let server: McpServer;
  let cache: TtlCache;

  beforeEach(() => {
    vi.unstubAllGlobals();
    mockFetchOk(MOCK_ITEMS);
    server = new McpServer({ name: 'test', version: '0.0.1' });
    cache = new TtlCache();
    registerStatementTools(server, new PersonalClient('token'), cache);
  });

  it('returns formatted transactions with ISO date', async () => {
    const result = await callTool(server, 'get_statement', {
      account_id: '0', from_date: '2024-05-01', to_date: '2024-05-20', limit: 50,
    });
    expect(result.isError).toBeFalsy();
    const data = JSON.parse(result.content[0]!.text as string);
    expect(data).toHaveLength(2);
    expect(data[0].description).toBe('Coffee Shop');
    expect(data[0].amount).toBe('-85.00 UAH');
    expect(data[0].time).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(data[0].comment).toBe('Morning latte');
  });

  it('parses ISO 8601 date string', async () => {
    await callTool(server, 'get_statement', {
      account_id: '0', from_date: '2024-05-01', to_date: '2024-05-20', limit: 10,
    });
    const url = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string;
    expect(url).toContain('/personal/statement/0/');
    const parts = url.split('/');
    const from = parseInt(parts[parts.length - 2]!, 10);
    expect(from).toBe(Math.floor(new Date('2024-05-01').getTime() / 1000));
  });

  it('parses Unix timestamp string', async () => {
    await callTool(server, 'get_statement', {
      from_date: '1714521600', to_date: '1715731200', limit: 10,
    });
    const url = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string;
    expect(url).toContain('/1714521600/1715731200');
  });

  it('rejects date range exceeding 31 days', async () => {
    const result = await callTool(server, 'get_statement', {
      from_date: '2024-01-01', to_date: '2024-03-01', limit: 10,
    });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('31 days');
  });

  it('rejects from_date after to_date', async () => {
    const result = await callTool(server, 'get_statement', {
      from_date: '2024-05-20', to_date: '2024-05-01', limit: 10,
    });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('before');
  });

  it('rejects invalid date format', async () => {
    const result = await callTool(server, 'get_statement', {
      from_date: 'not-a-date', to_date: '2024-05-20', limit: 10,
    });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('Invalid date');
  });

  it('respects limit parameter', async () => {
    const result = await callTool(server, 'get_statement', {
      from_date: '2024-05-01', to_date: '2024-05-20', limit: 1,
    });
    const data = JSON.parse(result.content[0]!.text as string);
    expect(data).toHaveLength(1);
  });

  it('returns "No transactions" for empty result', async () => {
    mockFetchOk([]);
    const result = await callTool(server, 'get_statement', {
      from_date: '2024-05-01', to_date: '2024-05-20', limit: 10,
    });
    expect(result.content[0]!.text).toBe('No transactions in this period.');
  });

  it('uses cache on second call', async () => {
    const args = { from_date: '2024-05-01', to_date: '2024-05-20', limit: 50 };
    await callTool(server, 'get_statement', args);
    await callTool(server, 'get_statement', args);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe('get_recent_transactions tool', () => {
  let server: McpServer;

  beforeEach(() => {
    vi.unstubAllGlobals();
    mockFetchOk(MOCK_ITEMS);
    server = new McpServer({ name: 'test', version: '0.0.1' });
    registerStatementTools(server, new PersonalClient('token'), new TtlCache());
  });

  it('calculates from/to based on minutes', async () => {
    const before = Math.floor(Date.now() / 1000);
    await callTool(server, 'get_recent_transactions', { minutes: 120, limit: 20 });
    const url = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string;
    const parts = url.split('/');
    const from = parseInt(parts[parts.length - 2]!, 10);
    const to = parseInt(parts[parts.length - 1]!, 10);
    expect(to - from).toBe(120 * 60);
    expect(Math.abs(to - before)).toBeLessThan(5);
  });

  it('defaults to 60 minutes and 20 limit', async () => {
    const result = await callTool(server, 'get_recent_transactions', {});
    expect(result.isError).toBeFalsy();
    const data = JSON.parse(result.content[0]!.text as string);
    expect(data.length).toBeLessThanOrEqual(20);
  });
});
