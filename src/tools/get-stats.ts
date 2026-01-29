import { z } from "zod";
import type { Config } from "../config.js";
import { fetchWithTimeout, assertOk } from "../http.js";
import { mcpOk } from "../mcp.js";

export const getStatsTool = {
  name: "1ly_get_stats",
  description: "Get store or link stats (requires ONELY_API_KEY).",
  inputSchema: {
    type: "object" as const,
    properties: {
      period: { type: "string", enum: ["7d", "30d", "90d", "all"] },
      linkId: { type: "string" },
    },
    required: [],
  },
};

const InputSchema = z.object({
  period: z.enum(["7d", "30d", "90d", "all"]).optional(),
  linkId: z.string().uuid().optional(),
});

export async function handleGetStats(args: unknown, config: Config) {
  const input = InputSchema.parse(args);
  if (!config.apiKey) {
    throw new Error("Missing ONELY_API_KEY for stats");
  }

  const url = new URL(`${config.apiBase}/api/v1/stats`);
  if (input.period) url.searchParams.set("period", input.period);
  if (input.linkId) url.searchParams.set("linkId", input.linkId);

  const res = await fetchWithTimeout(url.toString(), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
    },
  });

  await assertOk(res, "Get stats failed");
  const data = await res.json();
  return mcpOk(data);
}
