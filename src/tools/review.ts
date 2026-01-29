import { z } from "zod";
import type { Config } from "../config.js";
import { getWalletAddress } from "../wallet/solana.js";
import { getEvmWalletAddress } from "../wallet/evm.js";
import { fetchWithTimeout, assertOk } from "../http.js";
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
  if (!config.wallet) {
    throw new Error("Missing wallet config: set ONELY_WALLET_TYPE and ONELY_WALLET_KEY");
  }

  const walletAddress = config.wallet.type === "solana"
    ? await getWalletAddress(config.wallet.type, config.wallet.key)
    : await getEvmWalletAddress(config.wallet.key);

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

  const data = (await response.json()) as { reviewId: string };

  return mcpOk({
    success: true,
    reviewId: data.reviewId,
    message: input.positive
      ? "Positive review submitted!"
      : "Negative review submitted.",
  });
}
