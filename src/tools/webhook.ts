import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { TtlCache } from '../cache/ttl-cache.js';
import type { PersonalClient } from '../client/personal.js';
import type { ClientInfo } from '../types/monobank.js';
import { AuthError, RateLimitError } from '../errors/index.js';

export function registerWebhookTools(
  server: McpServer,
  client: PersonalClient,
  cache: TtlCache,
): void {
  server.registerTool(
    'set_webhook',
    {
      title: 'Set Webhook',
      description:
        'Register a webhook URL with Monobank. Monobank will POST real-time transaction events to this URL. The URL must be publicly accessible HTTPS and respond with HTTP 200 within 5 seconds.',
      inputSchema: {
        url: z
          .string()
          .url()
          .describe('Publicly accessible HTTPS URL to receive transaction events.'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ url }) => {
      try {
        await client.setWebhook(url);
        cache.invalidate('client-info');
        return {
          content: [{
            type: 'text' as const,
            text: `Webhook registered at ${url}. Monobank will POST StatementItem events to this URL when transactions occur.`,
          }],
        };
      } catch (err) {
        return handleError(err);
      }
    },
  );

  server.registerTool(
    'delete_webhook',
    {
      title: 'Delete Webhook',
      description: 'Unregister the current webhook. Monobank will stop sending transaction notifications.',
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async () => {
      try {
        await client.setWebhook('');
        cache.invalidate('client-info');
        return { content: [{ type: 'text' as const, text: 'Webhook unregistered.' }] };
      } catch (err) {
        return handleError(err);
      }
    },
  );

  server.registerTool(
    'get_webhook_status',
    {
      title: 'Get Webhook Status',
      description: 'Check the currently registered webhook URL for your account.',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      try {
        const cacheKey = 'client-info';
        let info = cache.get<ClientInfo>(cacheKey);
        if (!info) {
          info = await client.getClientInfo();
          cache.set(cacheKey, info, 59);
        }
        const url = info.webHookUrl;
        const status = url ? `Active: ${url}` : 'No webhook registered.';
        return { content: [{ type: 'text' as const, text: status }] };
      } catch (err) {
        return handleError(err);
      }
    },
  );
}

function handleError(err: unknown) {
  if (err instanceof AuthError) {
    return {
      content: [{ type: 'text' as const, text: `Authentication failed: ${err.message}` }],
      isError: true,
    };
  }
  if (err instanceof RateLimitError) {
    return {
      content: [{
        type: 'text' as const,
        text: `Rate limit hit. Retry in ${err.retryAfterSeconds ?? 60}s.`,
      }],
      isError: true,
    };
  }
  const message = err instanceof Error ? err.message : String(err);
  return {
    content: [{ type: 'text' as const, text: `Error: ${message}` }],
    isError: true,
  };
}
