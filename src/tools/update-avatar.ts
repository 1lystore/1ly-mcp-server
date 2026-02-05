import { z } from "zod";
import type { Config } from "../config.js";
import { fetchWithTimeout, assertOk } from "../http.js";
import { mcpOk } from "../mcp.js";

export const updateAvatarTool = {
  name: "1ly_update_avatar",
  description: "Update your store avatar image (requires ONELY_API_KEY).",
  inputSchema: {
    type: "object" as const,
    properties: {
      avatarUrl: { type: "string", description: "Public image URL to use as avatar" },
      imageBase64: { type: "string", description: "Base64-encoded image bytes" },
      mimeType: { type: "string", description: "Image MIME type (image/png, image/jpeg, image/webp, image/gif)" },
      filename: { type: "string", description: "Optional filename (default: avatar.png)" },
    },
  },
};

const InputSchema = z.object({
  avatarUrl: z.string().url().optional(),
  imageBase64: z.string().min(1).optional(),
  mimeType: z.string().min(3).optional(),
  filename: z.string().optional(),
});

export async function handleUpdateAvatar(args: unknown, config: Config) {
  const input = InputSchema.parse(args);
  if (!config.apiKey) {
    throw new Error("Missing ONELY_API_KEY for updating avatar");
  }

  if (input.avatarUrl) {
    const res = await fetchWithTimeout(`${config.apiBase}/api/v1/avatar`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({ avatarUrl: input.avatarUrl }),
    });

    await assertOk(res, "Update avatar failed");
    const data = await res.json();
    return mcpOk(data);
  }

  if (!input.imageBase64 || !input.mimeType) {
    throw new Error("Provide either avatarUrl or imageBase64 + mimeType");
  }

  const buffer = Buffer.from(input.imageBase64, "base64");
  const blob = new Blob([buffer], { type: input.mimeType });
  const formData = new FormData();
  formData.append("file", blob, input.filename || "avatar.png");

  const res = await fetchWithTimeout(`${config.apiBase}/api/v1/avatar`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: formData,
  });

  await assertOk(res, "Update avatar failed");
  const data = await res.json();
  return mcpOk(data);
}
