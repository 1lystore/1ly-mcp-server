import type { Config } from "../config.js";
import { fetchWithTimeout, assertOk } from "../http.js";
import { mcpOk } from "../mcp.js";

export const listKeysTool = {
  name: "1ly_list_keys",
  description: "List API keys for the authenticated agent store (requires ONELY_API_KEY).",
  inputSchema: {
    type: "object" as const,
    properties: {},
  },
};

export async function handleListKeys(_args: unknown, config: Config) {
  if (!config.apiKey) {
    throw new Error("Missing ONELY_API_KEY for listing keys");
  }

  const res = await fetchWithTimeout(`${config.apiBase}/api/agent/keys`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
    },
  });

  await assertOk(res, "List keys failed");
  const data = await res.json();
  return mcpOk(data);
}
