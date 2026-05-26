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
        '[Corporate API only] Start the user authorization flow. Returns an acceptUrl the user must open in their Monobank app and a tokenRequestId for polling status. After calling this, show the user the acceptUrl and poll check_authorization every 3-5 seconds with the tokenRequestId. The callback_url receives a POST with the auth token once the user approves.',
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
        openWorldHint: false,
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
        '[Corporate API only] Check if a user has approved the authorization request from initiate_authorization. Poll every 3-5 seconds after showing the user the Monobank app URL. Stop polling when status is approved (store the token) or rejected. Do not poll more frequently than every 3 seconds. Returns status: waiting (user has not acted yet), approved (token is ready), or rejected (user declined).',
      inputSchema: {
        request_id: z.string()
          .describe('The tokenRequestId returned by initiate_authorization'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
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
