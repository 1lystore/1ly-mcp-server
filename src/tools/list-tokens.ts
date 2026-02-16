import { z } from "zod";
import type { Config } from "../config.js";
import { fetchWithTimeout, assertOk } from "../http.js";
import { mcpOk } from "../mcp.js";
import { loadSolanaWallet } from "../wallet/solana.js";

export const listTokensTool = {
  name: "1ly_list_tokens",
  description:
    "List tokens launched by a wallet (Bags only; public listing by wallet address).",
  inputSchema: {
    type: "object" as const,
    properties: {
      platform: { type: "string", enum: ["bags"] },
      creatorWallet: { type: "string", description: "Override wallet address" },
      limit: { type: "number", description: "Max results (default 10, max 200)" },
    },
  },
};

const InputSchema = z.object({
  platform: z.literal("bags").optional(),
  creatorWallet: z.string().optional(),
  limit: z.number().int().positive().max(200).optional(),
});

export async function handleListTokens(args: unknown, config: Config) {
  const input = InputSchema.parse(args);
  const solanaKey =
    config.walletSolana || (config.wallet?.type === "solana" ? config.wallet.key : null);
  const walletAddress = input.creatorWallet
    ? input.creatorWallet
    : solanaKey
    ? (await loadSolanaWallet(solanaKey)).publicKey.toBase58()
    : null;

  if (!walletAddress) {
    throw new Error("Missing Solana wallet config: set ONELY_WALLET_SOLANA_KEY");
  }

  const url = new URL(`${config.apiBase}/api/token-launches`);
  url.searchParams.set("creatorWallet", walletAddress);
  url.searchParams.set("platform", "bags");
  if (input.limit) url.searchParams.set("limit", String(input.limit));

  const res = await fetchWithTimeout(url.toString(), { method: "GET" });
  await assertOk(res, "List tokens failed");
  const data = await res.json();
  return mcpOk(data);
}
