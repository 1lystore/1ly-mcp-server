import { z } from "zod";
import type { Config } from "../config.js";
import { fetchWithTimeout, assertOk } from "../http.js";
import { mcpOk } from "../mcp.js";

export const createKeyTool = {
  name: "1ly_create_key",
  description: "Create a new API key for the authenticated agent store (requires ONELY_API_KEY).",
  inputSchema: {
    type: "object" as const,
    properties: {
      name: { type: "string" },
    },
  },
};

const InputSchema = z.object({
  name: z.string().min(1).max(64).optional(),
});

export async function handleCreateKey(args: unknown, config: Config) {
  const input = InputSchema.parse(args);
  if (!config.apiKey) {
    throw new Error("Missing ONELY_API_KEY for creating keys");
  }

  const res = await fetchWithTimeout(`${config.apiBase}/api/agent/keys`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({ name: input.name }),
  });

  await assertOk(res, "Create key failed");
  const data = await res.json();
  return mcpOk(data);
}
