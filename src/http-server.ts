/**
 * HTTP MCP Server
 *
 * Serves MCP over HTTP using StreamableHTTPServerTransport.
 * Provides the same tools and behavior as the stdio server.
 */

import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpServer } from "./server.js";

const DEFAULT_PORT = 3000;
const DEFAULT_HOST = "0.0.0.0";

export interface HttpServerOptions {
  port?: number;
  host?: string;
  sessionIdGenerator?: () => string;
}

export async function startHttpServer(options: HttpServerOptions = {}): Promise<void> {
  const envPort = process.env.MCP_HTTP_PORT ? Number(process.env.MCP_HTTP_PORT) : undefined;
  const platformPort = process.env.PORT ? Number(process.env.PORT) : undefined;
  const port = options.port ?? envPort ?? platformPort ?? DEFAULT_PORT;
  const host = options.host ?? process.env.MCP_HTTP_HOST ?? DEFAULT_HOST;

  const transports = new Map<
    string,
    { transport: StreamableHTTPServerTransport; server: ReturnType<typeof createMcpServer> }
  >();

  const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);
    const pathname = url.pathname;

    // Health check endpoint
    if (pathname === "/health" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", version: "0.1.8" }));
      return;
    }

    // MCP endpoint
    if (pathname === "/mcp" || pathname === "/") {
      // Get or create transport for this session
      const sessionId = req.headers["mcp-session-id"] as string | undefined;

      let transport: StreamableHTTPServerTransport;
      let mcpServer: ReturnType<typeof createMcpServer>;

      if (sessionId && transports.has(sessionId)) {
        const entry = transports.get(sessionId)!;
        transport = entry.transport;
        mcpServer = entry.server;
      } else {
        // Create new transport with session management
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: options.sessionIdGenerator ?? (() => crypto.randomUUID()),
        });

        // Create a fresh MCP server per transport
        mcpServer = createMcpServer();
        await mcpServer.connect(transport);

        // Store transport by session ID once available
        transport.onclose = () => {
          if (transport.sessionId) {
            transports.delete(transport.sessionId);
          }
        };

        // Wait for session ID to be generated on first request
        if (transport.sessionId) {
          transports.set(transport.sessionId, { transport, server: mcpServer });
        }
      }

      try {
        await transport.handleRequest(req, res);

        // Store transport if session ID now available
        if (transport.sessionId && !transports.has(transport.sessionId)) {
          transports.set(transport.sessionId, { transport, server: mcpServer! });
        }
      } catch (error) {
        console.error("Error handling MCP request:", error);
        if (!res.headersSent) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Internal server error" }));
        }
      }
      return;
    }

    // 404 for unknown paths
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  });

  return new Promise((resolve, reject) => {
    httpServer.on("error", reject);
    httpServer.listen(port, host, () => {
      console.error(`1ly MCP HTTP server running at http://${host}:${port}`);
      console.error(`  - MCP endpoint: http://${host}:${port}/mcp`);
      console.error(`  - Health check: http://${host}:${port}/health`);
      resolve();
    });
  });
}
