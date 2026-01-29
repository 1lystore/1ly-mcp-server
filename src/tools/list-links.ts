import type { Config } from "../config.js";
import { fetchWithTimeout, assertOk } from "../http.js";
import { mcpOk } from "../mcp.js";

export const listLinksTool = {
  name: "1ly_list_links",
  description: "List API links for the authenticated store (requires ONELY_API_KEY).",
  inputSchema: {
    type: "object" as const,
    properties: {},
    required: [],
  },
};

export async function handleListLinks(_args: unknown, config: Config) {
  if (!config.apiKey) {
    throw new Error("Missing ONELY_API_KEY for list links");
  }

  const res = await fetchWithTimeout(`${config.apiBase}/api/v1/links`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
    },
  });

  await assertOk(res, "List links failed");
  const data = await res.json();
  return mcpOk(data);
}
