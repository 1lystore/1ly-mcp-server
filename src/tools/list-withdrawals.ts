import { z } from "zod";
import type { Config } from "../config.js";
import { fetchWithTimeout, assertOk } from "../http.js";
import { mcpOk } from "../mcp.js";

export const listWithdrawalsTool = {
  name: "1ly_list_withdrawals",
  description: "List withdrawal requests for your store (requires ONELY_API_KEY).",
  inputSchema: {
    type: "object" as const,
    properties: {
      limit: { type: "number", description: "Max items (default 25, max 100)" },
      cursor: { type: "string", description: "Pagination cursor from previous response" },
    },
  },
};

const InputSchema = z.object({
  limit: z.number().min(1).max(100).optional(),
  cursor: z.string().optional(),
});

export async function handleListWithdrawals(args: unknown, config: Config) {
  const input = InputSchema.parse(args);
  if (!config.apiKey) {
    throw new Error("Missing ONELY_API_KEY for listing withdrawals");
  }

  const url = new URL(`${config.apiBase}/api/v1/withdrawals`);
  if (input.limit) url.searchParams.set("limit", String(input.limit));
  if (input.cursor) url.searchParams.set("cursor", input.cursor);

  const res = await fetchWithTimeout(url.toString(), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
    },
  });

  await assertOk(res, "List withdrawals failed");
  const data = await res.json();
  return mcpOk(data);
}
