import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CorporateClient } from '../client/corporate.js';
import { AuthError } from '../errors/index.js';

export function registerCorporateSettingsTools(
  server: McpServer,
  client: CorporateClient,
): void {
  server.registerTool(
    'get_corp_settings',
    {
      title: 'Get Corporate Settings',
      description:
        '[Corporate API only] Retrieve the corporate application configuration registered with Monobank. Use to verify app setup, check the active webhook URL, or confirm which permissions were granted. Returns: pubkey (SHA1 hash), app name, permission flags (s=statements, p=personal info), logo URL, and current webhook URL.',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      try {
        const settings = await client.getCorpSettings();
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(settings, null, 2) }],
        };
      } catch (err) {
        return handleError(err);
      }
    },
  );

  server.registerTool(
    'set_corp_webhook',
    {
      title: 'Set Corporate Webhook',
      description:
        '[Corporate API only] Register or replace the webhook URL for the corporate application. Monobank will POST authorization results and transaction events to this URL. Use during initial app setup or when your server URL changes. Replaces any existing webhook. The URL must be publicly accessible HTTPS with a CA-issued certificate that returns HTTP 200 within 5 seconds. Returns confirmation after successful registration.',
      inputSchema: {
        url: z.string().url()
          .describe('Publicly accessible HTTPS URL to receive authorization and transaction events'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ url }) => {
      try {
        await client.setCorpWebhook(url);
        return {
          content: [{ type: 'text' as const, text: `Corporate webhook set to: ${url}` }],
        };
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
  const message = err instanceof Error ? err.message : String(err);
  return {
    content: [{ type: 'text' as const, text: `Error: ${message}` }],
    isError: true,
  };
}
