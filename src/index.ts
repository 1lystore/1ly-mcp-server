#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer } from "./server.js";
import { startHttpServer } from "./http-server.js";
import { runSelfTest } from "./selftest.js";

const argv = process.argv.slice(2);
const isSelfTest = argv.includes("--self-test");
const isHttp = argv.includes("--http") || process.env.MCP_TRANSPORT === "http";

async function main() {
  if (isSelfTest) {
    const code = await runSelfTest(argv);
    process.exit(code);
  }

  if (isHttp) {
    // HTTP mode: serve MCP over HTTP
    const port = Number(process.env.MCP_HTTP_PORT) || 3000;
    const host = process.env.MCP_HTTP_HOST || "0.0.0.0";
    await startHttpServer({ port, host });
  } else {
    // Stdio mode (default): serve MCP over stdio
    const server = createMcpServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("1ly MCP server running (stdio)");
  }
}

main().catch(console.error);
