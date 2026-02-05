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
import { loadConfigWithStoredKey } from "./config.js";
import { runSelfTest } from "./selftest.js";
import { mcpError } from "./mcp.js";

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
      version: "0.1.2",
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

        default:
          return {
            content: [{ type: "text", text: `Unknown tool: ${name}` }],
            isError: true,
          };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return mcpError(message);
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("1ly MCP server running");
}

main().catch(console.error);
