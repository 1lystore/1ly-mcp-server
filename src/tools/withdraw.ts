import { z } from "zod";
import type { Config } from "../config.js";
import { fetchWithTimeout, assertOk } from "../http.js";
import { mcpOk } from "../mcp.js";

export const withdrawTool = {
  name: "1ly_withdraw",
  description: "Request a withdrawal of your available balance to a Solana wallet (requires ONELY_API_KEY).",
  inputSchema: {
    type: "object" as const,
    properties: {
      amount: { type: "string", description: "Amount in USDC (e.g. '1.25')" },
      walletAddress: { type: "string", description: "Solana wallet address to receive funds" },
    },
    required: ["amount", "walletAddress"],
  },
};

const InputSchema = z.object({
  amount: z.string().regex(/^\d+(\.\d{1,18})?$/),
  walletAddress: z.string().min(26),
});

export async function handleWithdraw(args: unknown, config: Config) {
  const input = InputSchema.parse(args);
  if (!config.apiKey) {
    throw new Error("Missing ONELY_API_KEY for withdrawals");
  }

  const res = await fetchWithTimeout(`${config.apiBase}/api/v1/withdrawals`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      amount: input.amount,
      walletAddress: input.walletAddress,
      chain: "solana",
    }),
  });

  await assertOk(res, "Withdraw request failed");
  const data = await res.json();
  return mcpOk(data);
}
