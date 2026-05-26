import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TtlCache } from '../../src/cache/ttl-cache.js';
import { PersonalClient } from '../../src/client/personal.js';
import { registerWebhookTools } from '../../src/tools/webhook.js';
import type { ClientInfo } from '../../src/types/monobank.js';

const MOCK_CLIENT_INFO: ClientInfo = {
  clientId: 'id', name: 'Test', webHookUrl: 'https://example.com/hook',
  permissions: 'psfj', accounts: [], jars: [],
};

function mockFetchOk(data?: unknown) {
  const body = data ? JSON.stringify(data) : '';
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

describe('webhook tools', () => {
  let server: McpServer;
  let cache: TtlCache;
  let client: PersonalClient;

  beforeEach(() => {
    vi.unstubAllGlobals();
    server = new McpServer({ name: 'test', version: '0.0.1' });
    cache = new TtlCache();
    client = new PersonalClient('token');
    registerWebhookTools(server, client, cache);
  });

  describe('set_webhook', () => {
    it('registers webhook and confirms', async () => {
      mockFetchOk();
      const result = await callTool(server, 'set_webhook', { url: 'https://my.app/hook' });
      expect(result.isError).toBeFalsy();
      expect(result.content[0]!.text).toContain('https://my.app/hook');
      expect(result.content[0]!.text).toContain('Webhook registered');
    });

    it('invalidates client-info cache after setting', async () => {
      cache.set('client-info', MOCK_CLIENT_INFO, 60);
      mockFetchOk();
      await callTool(server, 'set_webhook', { url: 'https://my.app/hook' });
      expect(cache.get('client-info')).toBeUndefined();
    });
  });

  describe('delete_webhook', () => {
    it('unregisters webhook', async () => {
      mockFetchOk();
      const result = await callTool(server, 'delete_webhook');
      expect(result.isError).toBeFalsy();
      expect(result.content[0]!.text).toContain('unregistered');
    });

    it('sends empty webHookUrl', async () => {
      mockFetchOk();
      await callTool(server, 'delete_webhook');
      expect(fetch).toHaveBeenCalledWith(
        'https://api.monobank.ua/personal/webhook',
        expect.objectContaining({
          body: '{"webHookUrl":""}',
        }),
      );
    });
  });

  describe('get_webhook_status', () => {
    it('shows active webhook from cache', async () => {
      cache.set('client-info', MOCK_CLIENT_INFO, 60);
      const result = await callTool(server, 'get_webhook_status');
      expect(result.content[0]!.text).toBe('Active: https://example.com/hook');
    });

    it('shows no webhook when empty', async () => {
      cache.set('client-info', { ...MOCK_CLIENT_INFO, webHookUrl: '' }, 60);
      const result = await callTool(server, 'get_webhook_status');
      expect(result.content[0]!.text).toBe('No webhook registered.');
    });

    it('fetches from API when cache is empty', async () => {
      mockFetchOk(MOCK_CLIENT_INFO);
      const result = await callTool(server, 'get_webhook_status');
      expect(result.content[0]!.text).toContain('https://example.com/hook');
      expect(fetch).toHaveBeenCalledTimes(1);
    });
  });
});
