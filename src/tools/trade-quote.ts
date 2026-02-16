import { z } from "zod";
import type { Config } from "../config.js";
import { fetchWithTimeout, assertOk } from "../http.js";
import { mcpOk } from "../mcp.js";

export const tradeQuoteTool = {
  name: "1ly_trade_quote",
  description: "Get a Bags trade quote without executing a swap (Bags only).",
  inputSchema: {
    type: "object" as const,
    properties: {
      platform: { type: "string", enum: ["bags"] },
      inputMint: { type: "string", description: "Input token mint" },
      outputMint: { type: "string", description: "Output token mint" },
      amount: { type: "string", description: "Amount in smallest units" },
      slippageMode: { type: "string", enum: ["auto", "manual"] },
      slippageBps: { type: "number", description: "Manual slippage (bps)" },
    },
    required: ["inputMint", "outputMint", "amount"],
  },
};

const InputSchema = z.object({
  platform: z.literal("bags").optional(),
  inputMint: z.string(),
  outputMint: z.string(),
  amount: z
    .string()
    .regex(/^\d+$/)
    .refine((value) => Number(value) > 0, {
      message: "amount must be a positive number in smallest units",
    }),
  slippageMode: z.enum(["auto", "manual"]).optional().default("auto"),
  slippageBps: z.number().int().min(0).max(10000).optional(),
});

export async function handleTradeQuote(args: unknown, config: Config) {
  const input = InputSchema.parse(args);
  if (input.slippageMode === "manual" && !input.slippageBps) {
    throw new Error("Missing slippageBps for manual slippage mode");
  }

  const quoteRes = await fetchWithTimeout(`${config.apiBase}/api/bags/trade/quote`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    retries: 2,
    body: JSON.stringify({
      inputMint: input.inputMint,
      outputMint: input.outputMint,
      amount: input.amount,
      slippageMode: input.slippageMode,
      slippageBps: input.slippageBps,
    }),
  });
  await assertOk(quoteRes, "Trade quote failed");
  const quote = await quoteRes.json();

  return mcpOk(quote);
}
