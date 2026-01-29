import { z } from "zod";
import type { Config } from "../config.js";
import { fetchWithTimeout, assertOk } from "../http.js";
import { mcpOk } from "../mcp.js";

export const updateLinkTool = {
  name: "1ly_update_link",
  description: "Update an API link by id (requires ONELY_API_KEY).",
  inputSchema: {
    type: "object" as const,
    properties: {
      id: { type: "string" },
      title: { type: "string" },
      url: { type: "string" },
      description: { type: "string" },
      slug: { type: "string" },
      price: { type: "string" },
      isPublic: { type: "boolean" },
      isStealth: { type: "boolean" },
    },
    required: ["id"],
  },
};

const InputSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(200).optional(),
  url: z.string().url().optional(),
  description: z.string().max(500).nullable().optional(),
  slug: z.string().min(3).max(64).regex(/^[a-z0-9-]+$/).optional(),
  price: z.string().regex(/^\d+(\.\d{1,18})?$/).optional(),
  isPublic: z.boolean().optional(),
  isStealth: z.boolean().optional(),
});

export async function handleUpdateLink(args: unknown, config: Config) {
  const input = InputSchema.parse(args);
  if (!config.apiKey) {
    throw new Error("Missing ONELY_API_KEY for update link");
  }

  const res = await fetchWithTimeout(`${config.apiBase}/api/v1/links/${input.id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      title: input.title,
      url: input.url,
      description: input.description,
      slug: input.slug,
      price: input.price,
      isPublic: input.isPublic,
      isStealth: input.isStealth,
    }),
  });

  await assertOk(res, "Update link failed");
  const data = await res.json();
  return mcpOk(data);
}
