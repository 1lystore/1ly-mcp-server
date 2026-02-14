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
  imageBase64: z
    .string()
    .min(1)
    .max(10_485_760) // 10MB max (base64 encoded ~= 1.37x original size)
    .optional(),
  mimeType: z
    .enum(["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"]) // Strict MIME type validation
    .optional(),
  filename: z
    .string()
    .regex(/^[a-zA-Z0-9_.-]+$/) // Prevent path traversal in filename
    .max(255)
    .optional(),
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

  // Decode and validate base64
  let buffer: Buffer;
  try {
    buffer = Buffer.from(input.imageBase64, "base64");
  } catch (err) {
    throw new Error("Invalid base64 encoding");
  }

  // Validate decoded size (5MB max for actual image data)
  const maxSize = 5 * 1024 * 1024; // 5MB
  if (buffer.length > maxSize) {
    throw new Error(
      `Image size ${(buffer.length / 1024 / 1024).toFixed(2)}MB exceeds 5MB limit`
    );
  }

  // Minimum size check (prevent empty uploads)
  if (buffer.length < 100) {
    throw new Error("Image too small - minimum 100 bytes");
  }

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
