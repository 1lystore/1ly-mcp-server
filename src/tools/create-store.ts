import { z } from "zod";
import type { Config } from "../config.js";
import { fetchWithTimeout, assertOk } from "../http.js";
import { mcpOk, McpToolError } from "../mcp.js";
import { getDefaultKeyPath } from "../keys.js";
import { getProvider } from "../provider/index.js";

export const createStoreTool = {
  name: "1ly_create_store",
  description:
    "Create a new store for your agent on 1ly using wallet signature.Returns store + API key.",
  inputSchema: {
    type: "object" as const,
    properties: {
      username: { type: "string" },
      displayName: { type: "string" },
      avatarUrl: { type: "string" },
    },
  },
};

const InputSchema = z.object({
  username: z.string().min(3).max(20).optional(),
  displayName: z.string().max(50).optional(),
  avatarUrl: z.string().url().optional(),
});

export async function handleCreateStore(args: unknown, config: Config) {
  const input = InputSchema.parse(args);
  const provider = await getProvider();

  // Coinbase Agentic Wallet doesn't support message signing for store creation
  if (provider.type === "coinbase") {
    throw new McpToolError(
      "Agentic Wallet does not support store creation yet. Set ONELY_WALLET_SOLANA_KEY or ONELY_WALLET_EVM_KEY.",
      { code: "AGENTIC_WALLET_BASE_ONLY", action: "use_raw_wallet_keys" }
    );
  }

  // Determine chain based on what's available
  let chain: "solana" | "base";
  let address: string;

  // Try Solana first, then EVM
  try {
    address = await provider.getPublicAddress("solana");
    chain = "solana";
  } catch {
    try {
      address = await provider.getPublicAddress("evm");
      chain = "base";
    } catch {
      throw new McpToolError(
        "No wallet configured. Set ONELY_WALLET_SOLANA_KEY or ONELY_WALLET_EVM_KEY.",
        { code: "MISSING_WALLET_CONFIG", action: "set_wallet_env" }
      );
    }
  }

  const nonceRes = await fetchWithTimeout(`${config.apiBase}/api/agent/auth/nonce`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address, chain }),
  });
  await assertOk(nonceRes, "Create store failed (nonce)");
  const nonceJson = (await nonceRes.json()) as { data?: { message?: string } };
  const message = nonceJson.data?.message;
  if (!message) {
    throw new Error("Missing message from nonce response");
  }

  // Sign the authentication message using the provider
  const signature = await provider.signMessage(message, chain === "solana" ? "solana" : "evm");

  const signupRes = await fetchWithTimeout(`${config.apiBase}/api/agent/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      address,
      chain,
      signature,
      message,
      username: input.username,
      displayName: input.displayName,
      avatarUrl: input.avatarUrl,
    }),
  });

  await assertOk(signupRes, "Create store failed (signup)");
  const data = (await signupRes.json()) as {
    data?: { apiKey?: string; store?: { username?: string; createdBy?: string } };
    meta?: Record<string, unknown>;
  };
  const apiKey = data?.data?.apiKey;
  if (apiKey) {
    // Save API key using provider (DCP stores in vault, Raw stores in file)
    await provider.writeCredential("credentials.api.1ly", apiKey);
    data.meta = {
      ...(data.meta || {}),
      savedKeyPath: getDefaultKeyPath(),
    };
  }
  return mcpOk(data);
}
