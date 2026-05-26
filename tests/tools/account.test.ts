import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TtlCache } from '../../src/cache/ttl-cache.js';
import { PersonalClient } from '../../src/client/personal.js';
import { registerAccountTools } from '../../src/tools/account.js';
import type { ClientInfo } from '../../src/types/monobank.js';

const MOCK_CLIENT_INFO: ClientInfo = {
  clientId: 'id',
  name: 'Test',
  webHookUrl: '',
  permissions: 'psfj',
  accounts: [
    {
      id: 'acc1', sendId: 's1', balance: 150000, creditLimit: 0,
      type: 'black', currencyCode: 980, cashbackType: 'UAH',
      maskedPan: ['5375****1234'], iban: 'UA123',
    },
  ],
  jars: [
    { id: 'jar1', sendId: 'sj1', title: 'Vacation', description: '', currencyCode: 980, balance: 50000, goal: 200000 },
  ],
};

function mockFetchOk(data: unknown) {
  const body = JSON.stringify(data);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true, status: 200, headers: new Headers(),
    text: vi.fn().mockResolvedValue(body),
  }));
}

async function callTool(server: McpServer, name: string, args: Record<string, unknown> = {}) {
  const tools = (server as unknown as { _registeredTools: Record<string, unknown> })._registeredTools;
  const tool = tools[name];
  return server.executeToolHandler(tool as never, args, {} as never);
}

describe('get_client_info tool', () => {
  let server: McpServer;
  let cache: TtlCache;
  let client: PersonalClient;

  beforeEach(() => {
    vi.unstubAllGlobals();
    mockFetchOk(MOCK_CLIENT_INFO);
    server = new McpServer({ name: 'test', version: '0.0.1' });
    cache = new TtlCache();
    client = new PersonalClient('token');
    registerAccountTools(server, client, cache);
  });

  it('calls API and returns formatted data', async () => {
    const result = await callTool(server, 'get_client_info');
    expect(result.isError).toBeFalsy();
    const data = JSON.parse(result.content[0]!.text as string);
    expect(data.name).toBe('Test');
    expect(data.accounts[0].balance).toBe('1500.00');
    expect(data.accounts[0].currency).toBe('UAH');
  });

  it('uses cache on second call', async () => {
    await callTool(server, 'get_client_info');
    await callTool(server, 'get_client_info');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('fetches again after cache invalidation', async () => {
    await callTool(server, 'get_client_info');
    cache.invalidate('client-info');
    await callTool(server, 'get_client_info');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('includes jars with progress', async () => {
    const result = await callTool(server, 'get_client_info');
    const data = JSON.parse(result.content[0]!.text as string);
    expect(data.jars[0].title).toBe('Vacation');
    expect(data.jars[0].balance).toBe('500.00');
    expect(data.jars[0].goal).toBe('2000.00');
  });

  it('returns error on auth failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 401, headers: new Headers(),
      text: vi.fn().mockResolvedValue(''),
    }));
    cache = new TtlCache();
    server = new McpServer({ name: 'test', version: '0.0.1' });
    client = new PersonalClient('bad-token');
    registerAccountTools(server, client, cache);

    const result = await callTool(server, 'get_client_info');
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('Authentication failed');
  });
});
