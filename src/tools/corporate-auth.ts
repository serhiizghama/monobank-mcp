import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CorporateClient } from '../client/corporate.js';
import { AuthError } from '../errors/index.js';

export function registerCorporateAuthTools(
  server: McpServer,
  client: CorporateClient,
): void {
  server.registerTool(
    'initiate_authorization',
    {
      title: 'Initiate Authorization',
      description:
        '[Corporate API only] Start the user authorization flow. Returns a URL the user must open in their Monobank app to approve access. Poll check_authorization with the returned requestId to confirm approval.',
      inputSchema: {
        callback_url: z.string().url()
          .describe('Publicly accessible HTTPS URL where Monobank will POST the authorization result'),
        permissions: z.string().optional().default('sp')
          .describe("Permission flags: 's' = statements, 'p' = personal info. Default: 'sp' (both)"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ callback_url, permissions }) => {
      try {
        const result = await client.initiateAuthorization(callback_url, permissions);
        return {
          content: [{
            type: 'text' as const,
            text: `Authorization initiated.\n\nAsk the user to open this URL in their Monobank app:\n${result.acceptUrl}\n\nRequest ID: ${result.tokenRequestId}\n\nUse check_authorization with this ID to confirm approval.`,
          }],
        };
      } catch (err) {
        return handleError(err);
      }
    },
  );

  server.registerTool(
    'check_authorization',
    {
      title: 'Check Authorization',
      description:
        '[Corporate API only] Check if a user has approved the authorization request.',
      inputSchema: {
        request_id: z.string()
          .describe('The tokenRequestId returned by initiate_authorization'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ request_id }) => {
      try {
        const result = await client.checkAuthorization(request_id);
        return {
          content: [{ type: 'text' as const, text: `Status: ${result.status}` }],
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
