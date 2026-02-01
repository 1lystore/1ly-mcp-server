import { z } from "zod";
import type { Config } from "../config.js";
import { loadSolanaWallet } from "../wallet/solana.js";
import { loadEvmWallet } from "../wallet/evm.js";
import { fetchWithTimeout, assertOk, HttpError } from "../http.js";
import { mcpOk } from "../mcp.js";

export const reviewTool = {
  name: "1ly_review",
  description:
    "Leave a review for a completed purchase on 1ly.store. Use the purchaseId and reviewToken from the _1ly metadata returned by 1ly_call.",
  inputSchema: {
    type: "object" as const,
    properties: {
      purchaseId: {
        type: "string",
        description: "Purchase ID from _1ly.purchaseId",
      },
      reviewToken: {
        type: "string",
        description: "Review token from _1ly.reviewToken",
      },
      positive: {
        type: "boolean",
        description: "true for positive review, false for negative",
      },
      comment: {
        type: "string",
        description: "Optional review comment (max 500 characters)",
      },
    },
    required: ["purchaseId", "reviewToken", "positive"],
  },
};

const InputSchema = z.object({
  purchaseId: z.string(),
  reviewToken: z.string(),
  positive: z.boolean(),
  comment: z.string().max(500).optional(),
});

export async function handleReview(args: unknown, config: Config) {
  const input = InputSchema.parse(args);
  const solanaKey = config.walletSolana || (config.wallet?.type === "solana" ? config.wallet.key : null);
  const evmKey = config.walletEvm || (config.wallet?.type === "evm" ? config.wallet.key : null);
  if (!solanaKey && !evmKey) {
    throw new Error(
      "Missing wallet config: set ONELY_WALLET_SOLANA_KEY or ONELY_WALLET_EVM_KEY (or legacy ONELY_WALLET_TYPE/KEY)"
    );
  }

  const solanaAddress = solanaKey
    ? (await loadSolanaWallet(solanaKey)).publicKey.toBase58()
    : null;
  const evmAddress = evmKey ? (await loadEvmWallet(evmKey)).address : null;

  const ordered = config.network === "solana"
    ? [solanaAddress, evmAddress]
    : [evmAddress, solanaAddress];

  let data: { reviewId: string } | null = null;
  let lastError: unknown = null;

  for (const walletAddress of ordered) {
    if (!walletAddress) continue;
    try {
      const response = await fetchWithTimeout(`${config.apiBase}/api/reviews`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          purchaseId: input.purchaseId,
          wallet: walletAddress,
          token: input.reviewToken,
          positive: input.positive,
          comment: input.comment,
        }),
      });

      await assertOk(response, "Review failed");
      data = (await response.json()) as { reviewId: string };
      break;
    } catch (err) {
      lastError = err;
      if (err instanceof HttpError && (err.status === 401 || err.status === 404)) {
        continue;
      }
      throw err;
    }
  }

  if (!data) {
    throw lastError instanceof Error ? lastError : new Error("Review failed");
  }

  return mcpOk({
    success: true,
    reviewId: data.reviewId,
    message: input.positive
      ? "Positive review submitted!"
      : "Negative review submitted.",
  });
}
