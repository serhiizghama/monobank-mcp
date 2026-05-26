import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TtlCache } from '../../src/cache/ttl-cache.js';
import { PersonalClient } from '../../src/client/personal.js';
import { registerCurrencyTools } from '../../src/tools/currency.js';

const MOCK_RATES = [
  { currencyCodeA: 840, currencyCodeB: 980, date: 1716000000, rateBuy: 41.0, rateSell: 41.5 },
  { currencyCodeA: 978, currencyCodeB: 980, date: 1716000000, rateBuy: 44.0, rateSell: 44.8 },
  { currencyCodeA: 826, currencyCodeB: 980, date: 1716000000, rateCross: 52.5 },
];

function mockFetchOk(data: unknown) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true, status: 200, headers: new Headers(),
    text: vi.fn().mockResolvedValue(JSON.stringify(data)),
  }));
}

async function callTool(server: McpServer, name: string, args: Record<string, unknown> = {}) {
  const tools = (server as unknown as { _registeredTools: Record<string, unknown> })._registeredTools;
  return server.executeToolHandler(tools[name] as never, args, {} as never);
}

describe('get_exchange_rates tool', () => {
  let server: McpServer;
  let cache: TtlCache;

  beforeEach(() => {
    vi.unstubAllGlobals();
    mockFetchOk(MOCK_RATES);
    server = new McpServer({ name: 'test', version: '0.0.1' });
    cache = new TtlCache();
    registerCurrencyTools(server, new PersonalClient('token'), cache);
  });

  it('returns formatted rates with currency symbols', async () => {
    const result = await callTool(server, 'get_exchange_rates');
    expect(result.isError).toBeFalsy();
    const data = JSON.parse(result.content[0]!.text as string);
    expect(data).toHaveLength(3);
    expect(data[0].pair).toBe('USD/UAH');
    expect(data[0].buy).toBe(41.0);
    expect(data[0].sell).toBe(41.5);
  });

  it('uses cross rate when buy/sell absent', async () => {
    const result = await callTool(server, 'get_exchange_rates');
    const data = JSON.parse(result.content[0]!.text as string);
    const gbp = data.find((r: { pair: string }) => r.pair === 'GBP/UAH');
    expect(gbp.cross).toBe(52.5);
    expect(gbp.buy).toBeUndefined();
  });

  it('caches for 5 minutes', async () => {
    await callTool(server, 'get_exchange_rates');
    await callTool(server, 'get_exchange_rates');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('returns error on auth failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 401, headers: new Headers(),
      text: vi.fn().mockResolvedValue(''),
    }));
    server = new McpServer({ name: 'test', version: '0.0.1' });
    registerCurrencyTools(server, new PersonalClient('token'), new TtlCache());

    const result = await callTool(server, 'get_exchange_rates');
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('Error');
  });
});
