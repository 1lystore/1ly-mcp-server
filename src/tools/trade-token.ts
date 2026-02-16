import { z } from "zod";
import type { Config } from "../config.js";
import { fetchWithTimeout, assertOk } from "../http.js";
import { McpToolError, mcpOk } from "../mcp.js";
import { loadSolanaWallet } from "../wallet/solana.js";
import { Connection } from "@solana/web3.js";
import { signAndSendVersionedTx } from "../solana-tx.js";

export const tradeTokenTool = {
  name: "1ly_trade_token",
  description: "Trade tokens on Bags (Bags only).",
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

export async function handleTradeToken(args: unknown, config: Config) {
  const input = InputSchema.parse(args);
  const solanaKey = config.walletSolana || (config.wallet?.type === "solana" ? config.wallet.key : null);
  if (!solanaKey) {
    throw new Error("Missing Solana wallet config: set ONELY_WALLET_SOLANA_KEY");
  }
  if (input.slippageMode === "manual" && !input.slippageBps) {
    throw new Error("Missing slippageBps for manual slippage mode");
  }

  const wallet = await loadSolanaWallet(solanaKey);
  const walletAddress = wallet.publicKey.toBase58();

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
  const quoteJson = (await quoteRes.json()) as any;
  const quote = quoteJson.response ?? quoteJson;

  const swapRes = await fetchWithTimeout(`${config.apiBase}/api/bags/trade/swap`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    retries: 2,
    body: JSON.stringify({
      quote,
      userPublicKey: walletAddress,
    }),
  });
  await assertOk(swapRes, "Trade swap failed");
  const swapJson = (await swapRes.json()) as {
    response?: {
      transactionBase64?: string;
      amountOut?: string;
      priceImpactPct?: string;
      tradeId?: string | null;
    };
    transactionBase64?: string;
    amountOut?: string;
    priceImpactPct?: string;
    tradeId?: string | null;
  };
  const swap = swapJson.response ?? swapJson;
  if (!swap.transactionBase64) {
    throw new Error("Trade swap missing transaction");
  }

  const connection = new Connection(config.solanaRpcUrl, "confirmed");
  let txSignature: string;
  try {
    txSignature = await signAndSendVersionedTx(
      connection,
      swap.transactionBase64,
      wallet
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    throw new McpToolError(
      "Trade submission failed or is uncertain. Verify on-chain before retrying.",
      {
        code: "TX_UNCERTAIN",
        action: "verify_on_chain_before_retry",
        meta: { details: message },
      }
    );
  }

  let recorded = false;
  let recordError: string | null = null;
  if (swap.tradeId) {
    try {
      const recordRes = await fetchWithTimeout(`${config.apiBase}/api/bags/trade/record`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        retries: 0,
        body: JSON.stringify({
          tradeId: swap.tradeId,
          txSignature,
        }),
      });
      await assertOk(recordRes, "Trade record failed");
      recorded = true;
    } catch (err) {
      recordError = err instanceof Error ? err.message : "Trade record failed";
    }
  }

  try {
    const { logSecurityEvent } = await import("../security-log.js");
    logSecurityEvent("token_traded", {
      platform: "bags",
      wallet: walletAddress,
      inputMint: input.inputMint,
      outputMint: input.outputMint,
      txSignature,
      amountIn: input.amount,
      amountOut: swap.amountOut,
    });
  } catch {
    // ignore logging failures
  }

  return mcpOk({
    inputMint: input.inputMint,
    outputMint: input.outputMint,
    amountIn: input.amount,
    amountOut: swap.amountOut,
    txSignature,
    priceImpactPct: swap.priceImpactPct,
    tradeId: swap.tradeId ?? null,
    recorded,
    recordError,
  });
}
