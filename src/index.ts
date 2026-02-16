#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
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
import { loadConfigWithStoredKey } from "./config.js";
import { runSelfTest } from "./selftest.js";
import { mapErrorToCode } from "./error-codes.js";
import { McpToolError, mcpError } from "./mcp.js";

const argv = process.argv.slice(2);
const isSelfTest = argv.includes("--self-test");

async function main() {
  if (isSelfTest) {
    const code = await runSelfTest(argv);
    process.exit(code);
  }

  const server = new Server(
    {
      name: "1ly",
      version: "0.1.5",
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

        default:
          return {
            content: [{ type: "text", text: `Unknown tool: ${name}` }],
            isError: true,
          };
      }
    } catch (error) {
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

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("1ly MCP server running");
}

main().catch(console.error);
