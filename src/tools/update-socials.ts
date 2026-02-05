import { z } from "zod";
import type { Config } from "../config.js";
import { fetchWithTimeout, assertOk } from "../http.js";
import { mcpOk } from "../mcp.js";

export const updateSocialsTool = {
  name: "1ly_update_socials",
  description: "Update socials for your store (requires ONELY_API_KEY).",
  inputSchema: {
    type: "object" as const,
    properties: {
      socials: {
        type: "array",
        items: {
          type: "object",
          properties: {
            type: {
              type: "string",
              enum: [
                "x",
                "github",
                "telegram",
                "web3_bio",
                "website",
                "youtube",
                "linkedin",
                "discord",
                "facebook",
                "tiktok",
                "instagram",
              ],
            },
            url: { type: "string" },
            displayOrder: { type: "number" },
            isVisible: { type: "boolean" },
          },
          required: ["type", "url"],
        },
      },
    },
    required: ["socials"],
  },
};

const socialTypeEnum = z.enum([
  "x",
  "github",
  "telegram",
  "web3_bio",
  "website",
  "youtube",
  "linkedin",
  "discord",
  "facebook",
  "tiktok",
  "instagram",
]);

const socialSchema = z.object({
  type: socialTypeEnum,
  url: z.string().url(),
  displayOrder: z.number().min(0).max(50).optional(),
  isVisible: z.boolean().optional(),
});

const InputSchema = z.object({
  socials: z.array(socialSchema).max(10),
});

export async function handleUpdateSocials(args: unknown, config: Config) {
  const input = InputSchema.parse(args);
  if (!config.apiKey) {
    throw new Error("Missing ONELY_API_KEY for updating socials");
  }

  const res = await fetchWithTimeout(`${config.apiBase}/api/v1/socials`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({ socials: input.socials }),
  });

  await assertOk(res, "Update socials failed");
  const data = await res.json();
  return mcpOk(data);
}
