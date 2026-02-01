import { z } from "zod";
import type { Config } from "../config.js";
import { fetchWithTimeout, assertOk } from "../http.js";
import { mcpOk } from "../mcp.js";

export const revokeKeyTool = {
  name: "1ly_revoke_key",
  description: "Revoke an API key for the authenticated agent store (requires ONELY_API_KEY).",
  inputSchema: {
    type: "object" as const,
    properties: {
      id: { type: "string" },
    },
    required: ["id"],
  },
};

const InputSchema = z.object({
  id: z.string().uuid(),
});

export async function handleRevokeKey(args: unknown, config: Config) {
  const input = InputSchema.parse(args);
  if (!config.apiKey) {
    throw new Error("Missing ONELY_API_KEY for revoking keys");
  }

  const res = await fetchWithTimeout(`${config.apiBase}/api/agent/keys/${input.id}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
    },
  });

  await assertOk(res, "Revoke key failed");
  const data = await res.json();
  return mcpOk(data);
}
