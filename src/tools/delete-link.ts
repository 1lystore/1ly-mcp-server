import { z } from "zod";
import type { Config } from "../config.js";
import { fetchWithTimeout, assertOk } from "../http.js";
import { mcpOk } from "../mcp.js";

export const deleteLinkTool = {
  name: "1ly_delete_link",
  description: "Delete an API link by id (requires ONELY_API_KEY).",
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

export async function handleDeleteLink(args: unknown, config: Config) {
  const input = InputSchema.parse(args);
  if (!config.apiKey) {
    throw new Error("Missing ONELY_API_KEY for delete link");
  }

  const res = await fetchWithTimeout(`${config.apiBase}/api/v1/links/${input.id}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
    },
  });

  await assertOk(res, "Delete link failed");
  const data = await res.json();
  return mcpOk(data);
}
