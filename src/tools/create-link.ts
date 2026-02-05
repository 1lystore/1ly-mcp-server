import { z } from "zod";
import type { Config } from "../config.js";
import { fetchWithTimeout, assertOk } from "../http.js";
import { mcpOk } from "../mcp.js";

export const createLinkTool = {
  name: "1ly_create_link",
  description: "Create a new API link (paid or free) using your 1ly developer API key.",
  inputSchema: {
    type: "object" as const,
    properties: {
      title: { type: "string" },
      url: { type: "string" },
      description: { type: "string" },
      slug: { type: "string" },
      price: { type: "string" },
      currency: { type: "string", enum: ["USDC"] },
      isPublic: { type: "boolean" },
      isStealth: { type: "boolean" },
      webhookUrl: { type: "string", description: "Optional webhook URL for purchase events" },
    },
    required: ["title", "url"],
  },
};

const InputSchema = z.object({
  title: z.string().min(1).max(200),
  url: z.string().url(),
  description: z.string().max(500).optional(),
  slug: z.string().min(3).max(64).regex(/^[a-z0-9-]+$/).optional(),
  price: z.string().regex(/^\d+(\.\d{1,18})?$/).optional(),
  currency: z.literal("USDC").optional(),
  isPublic: z.boolean().optional(),
  isStealth: z.boolean().optional(),
  webhookUrl: z.string().url().optional(),
});

export async function handleCreateLink(args: unknown, config: Config) {
  const input = InputSchema.parse(args);
  if (!config.apiKey) {
    throw new Error("Missing ONELY_API_KEY for create link");
  }

  const res = await fetchWithTimeout(`${config.apiBase}/api/v1/links`, {
    method: "POST",
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
      currency: input.currency || "USDC",
      isPublic: input.isPublic ?? true,
      isStealth: input.isStealth ?? false,
      webhookUrl: input.webhookUrl,
    }),
  });

  await assertOk(res, "Create link failed");
  const data = await res.json();
  return mcpOk(data);
}
