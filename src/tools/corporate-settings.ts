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
        '[Corporate API only] Get corporate application settings including registered public key, app name, permissions, and webhook URL.',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
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
        '[Corporate API only] Set or update the webhook URL for the corporate application.',
      inputSchema: {
        url: z.string().url()
          .describe('Publicly accessible HTTPS URL to receive events'),
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
