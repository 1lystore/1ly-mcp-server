import { z } from "zod";
import type { Config } from "../config.js";
import { fetchWithTimeout, assertOk } from "../http.js";
import { mcpOk } from "../mcp.js";

export const updateProfileTool = {
  name: "1ly_update_profile",
  description: "Update basic store profile details (requires ONELY_API_KEY).",
  inputSchema: {
    type: "object" as const,
    properties: {
      username: { type: "string", description: "New username (lowercase, underscores)" },
      displayName: { type: "string", description: "Public display name" },
      bio: { type: "string", description: "Short bio (max 160 chars)" },
    },
  },
};

const InputSchema = z.object({
  username: z.string().min(3).max(32).regex(/^[a-z0-9_]+$/).optional(),
  displayName: z.string().max(50).optional(),
  bio: z.string().max(160).optional(),
});

export async function handleUpdateProfile(args: unknown, config: Config) {
  const input = InputSchema.parse(args);
  if (!config.apiKey) {
    throw new Error("Missing ONELY_API_KEY for updating profile");
  }

  const res = await fetchWithTimeout(`${config.apiBase}/api/v1/profile`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(input),
  });

  await assertOk(res, "Update profile failed");
  const data = await res.json();
  return mcpOk(data);
}
