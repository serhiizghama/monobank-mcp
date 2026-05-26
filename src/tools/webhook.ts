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
        'Register or replace the webhook URL for real-time transaction notifications. Only one webhook can be active at a time — calling this replaces any existing URL. The URL must be publicly accessible HTTPS with a CA-issued certificate and respond with HTTP 200 within 5 seconds. After registration, Monobank will POST a StatementItem JSON payload on every transaction. Returns confirmation of registration.',
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
      description:
        'Disable the currently registered webhook, stopping all real-time transaction notifications. Use when decommissioning the integration or before switching to a new URL via set_webhook. Do not call if you only want to change the URL — call set_webhook directly instead (it replaces the existing URL). Returns confirmation. Has no effect if no webhook was registered.',
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
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
      description:
        'Check the currently registered webhook URL for your Monobank account. Use to verify whether a webhook is active before calling set_webhook or delete_webhook. Results come from the cached client-info (59s TTL). Returns the active webhook URL, or a message indicating no webhook is registered.',
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
