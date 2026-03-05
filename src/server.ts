/**
 * Shared MCP Server configuration
 *
 * This module creates and configures the MCP server instance that can be
 * used with either stdio or HTTP transports.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { searchTool, handleSearch } from "./tools/search.js";
import { detailsTool, handleDetails } from "./tools/details.js";
import { callTool, handleCall } from "./tools/call.js";
import { reviewTool, handleReview } from "./tools/review.js";
import { createLinkTool, handleCreateLink } from "./tools/create-link.js";
import { listLinksTool, handleListLinks } from "./tools/list-links.js";
import { updateLinkTool, handleUpdateLink } from "./tools/update-link.js";
import { deleteLinkTool, handleDeleteLink } from "./tools/delete-link.js";
import { getStatsTool, handleGetStats } from "./tools/get-stats.js";
import { createStoreTool, handleCreateStore } from "./tools/create-store.js";
import { listKeysTool, handleListKeys } from "./tools/list-keys.js";
import { createKeyTool, handleCreateKey } from "./tools/create-key.js";
import { revokeKeyTool, handleRevokeKey } from "./tools/revoke-key.js";
import { withdrawTool, handleWithdraw } from "./tools/withdraw.js";
import { listWithdrawalsTool, handleListWithdrawals } from "./tools/list-withdrawals.js";
import { updateProfileTool, handleUpdateProfile } from "./tools/update-profile.js";
import { updateSocialsTool, handleUpdateSocials } from "./tools/update-socials.js";
import { updateAvatarTool, handleUpdateAvatar } from "./tools/update-avatar.js";
import { launchTokenTool, handleLaunchToken } from "./tools/launch-token.js";
import { claimFeesTool, handleClaimFees } from "./tools/claim-fees.js";
import { tradeTokenTool, handleTradeToken } from "./tools/trade-token.js";
import { tradeQuoteTool, handleTradeQuote } from "./tools/trade-quote.js";
import { listTokensTool, handleListTokens } from "./tools/list-tokens.js";
import { vaultStatusSchema, handleVaultStatus } from "./tools/vault-status.js";
import { loadConfigWithStoredKey } from "./config.js";
import { mapErrorToCode } from "./error-codes.js";
import { McpToolError, mcpError, mcpVaultOffline } from "./mcp.js";
import { DcpRemoteError } from "./provider/dcp-remote.js";
import { ProviderError } from "./provider/index.js";

const SERVER_VERSION = "0.1.8";

export function createMcpServer(): Server {
  const server = new Server(
    {
      name: "1ly",
      version: SERVER_VERSION,
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      searchTool,
      detailsTool,
      callTool,
      reviewTool,
      createLinkTool,
      listLinksTool,
      updateLinkTool,
      deleteLinkTool,
      getStatsTool,
      createStoreTool,
      listKeysTool,
      createKeyTool,
      revokeKeyTool,
      withdrawTool,
      listWithdrawalsTool,
      updateProfileTool,
      updateSocialsTool,
      updateAvatarTool,
      launchTokenTool,
      listTokensTool,
      claimFeesTool,
      tradeTokenTool,
      tradeQuoteTool,
      vaultStatusSchema,
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      const config = await loadConfigWithStoredKey();
      switch (name) {
        case "1ly_search":
          return await handleSearch(args, config);

        case "1ly_get_details":
          return await handleDetails(args, config);

        case "1ly_call":
          return await handleCall(args, config);

        case "1ly_review":
          return await handleReview(args, config);
        case "1ly_create_link":
          return await handleCreateLink(args, config);
        case "1ly_list_links":
          return await handleListLinks(args, config);
        case "1ly_update_link":
          return await handleUpdateLink(args, config);
        case "1ly_delete_link":
          return await handleDeleteLink(args, config);
        case "1ly_get_stats":
          return await handleGetStats(args, config);
        case "1ly_create_store":
          return await handleCreateStore(args, config);
        case "1ly_list_keys":
          return await handleListKeys(args, config);
        case "1ly_create_key":
          return await handleCreateKey(args, config);
        case "1ly_revoke_key":
          return await handleRevokeKey(args, config);
        case "1ly_withdraw":
          return await handleWithdraw(args, config);
        case "1ly_list_withdrawals":
          return await handleListWithdrawals(args, config);
        case "1ly_update_profile":
          return await handleUpdateProfile(args, config);
        case "1ly_update_socials":
          return await handleUpdateSocials(args, config);
        case "1ly_update_avatar":
          return await handleUpdateAvatar(args, config);
        case "1ly_launch_token":
          return await handleLaunchToken(args, config);
        case "1ly_claim_fees":
          return await handleClaimFees(args, config);
        case "1ly_trade_token":
          return await handleTradeToken(args, config);
        case "1ly_trade_quote":
          return await handleTradeQuote(args, config);
        case "1ly_list_tokens":
          return await handleListTokens(args, config);

        case "1ly_vault_status":
          return await handleVaultStatus();

        default:
          return {
            content: [{ type: "text", text: `Unknown tool: ${name}` }],
            isError: true,
          };
      }
    } catch (error) {
      if (error instanceof DcpRemoteError) {
        if (
          error.code === "VAULT_OFFLINE" ||
          error.code === "RELAY_UNAVAILABLE" ||
          error.code === "RELAY_TIMEOUT" ||
          error.code === "RELAY_UNAUTHORIZED"
        ) {
          return mcpVaultOffline();
        }
        return mcpError(error.message, {
          code: error.code as import("./error-codes.js").McpErrorCode,
          action: "approve_in_dcp_app",
          meta: error.meta,
        });
      }
      if (error instanceof ProviderError && error.code === "VAULT_OFFLINE") {
        return mcpVaultOffline();
      }
      if (error instanceof McpToolError) {
        const mapping = error.code ? { code: error.code, action: error.action } : mapErrorToCode(error.message);
        return mcpError(error.message, {
          code: mapping.code,
          action: mapping.action,
          meta: error.meta,
        });
      }
      const message = error instanceof Error ? error.message : "Unknown error";
      const mapping = mapErrorToCode(message);
      return mcpError(message, { code: mapping.code, action: mapping.action });
    }
  });

  return server;
}
