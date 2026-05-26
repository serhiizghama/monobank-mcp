import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TtlCache } from '../../src/cache/ttl-cache.js';
import { PersonalClient } from '../../src/client/personal.js';
import { registerJarTools } from '../../src/tools/jars.js';
import type { ClientInfo } from '../../src/types/monobank.js';

const CLIENT_WITH_JARS: ClientInfo = {
  clientId: 'id', name: 'Test', webHookUrl: '', permissions: '', accounts: [],
  jars: [
    { id: 'j1', sendId: 's1', title: 'Vacation', description: 'Trip to Italy', currencyCode: 980, balance: 75000, goal: 200000 },
    { id: 'j2', sendId: 's2', title: 'Laptop', description: '', currencyCode: 840, balance: 50000, goal: 0 },
  ],
};

const CLIENT_NO_JARS: ClientInfo = {
  clientId: 'id', name: 'Test', webHookUrl: '', permissions: '', accounts: [],
};

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

describe('get_jars tool', () => {
  let server: McpServer;
  let cache: TtlCache;

  beforeEach(() => {
    vi.unstubAllGlobals();
    server = new McpServer({ name: 'test', version: '0.0.1' });
    cache = new TtlCache();
    registerJarTools(server, new PersonalClient('token'), cache);
  });

  it('returns jars with balances and progress', async () => {
    mockFetchOk(CLIENT_WITH_JARS);
    const result = await callTool(server, 'get_jars');
    expect(result.isError).toBeFalsy();
    const data = JSON.parse(result.content[0]!.text as string);
    expect(data).toHaveLength(2);
    expect(data[0].title).toBe('Vacation');
    expect(data[0].balance).toBe('750.00');
    expect(data[0].goal).toBe('2000.00');
    expect(data[0].progress).toBe('37.5%');
    expect(data[0].currency).toBe('UAH');
  });

  it('handles jar without goal', async () => {
    mockFetchOk(CLIENT_WITH_JARS);
    const result = await callTool(server, 'get_jars');
    const data = JSON.parse(result.content[0]!.text as string);
    expect(data[1].goal).toBe('No goal set');
    expect(data[1].progress).toBeUndefined();
    expect(data[1].currency).toBe('USD');
  });

  it('returns message when no jars exist', async () => {
    mockFetchOk(CLIENT_NO_JARS);
    const result = await callTool(server, 'get_jars');
    expect(result.content[0]!.text).toBe('No savings jars found.');
  });

  it('uses cached client-info', async () => {
    cache.set('client-info', CLIENT_WITH_JARS, 60);
    mockFetchOk(CLIENT_WITH_JARS);
    await callTool(server, 'get_jars');
    expect(fetch).not.toHaveBeenCalled();
  });
});
