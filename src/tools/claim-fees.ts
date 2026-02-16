import { z } from "zod";
import type { Config } from "../config.js";
import { fetchWithTimeout, assertOk } from "../http.js";
import { mcpOk } from "../mcp.js";
import { loadSolanaWallet } from "../wallet/solana.js";
import { Connection } from "@solana/web3.js";
import { signAndSendLegacyTx, signAndSendVersionedTx } from "../solana-tx.js";

export const claimFeesTool = {
  name: "1ly_claim_fees",
  description: "Claim Bags fee share for a token (Bags only).",
  inputSchema: {
    type: "object" as const,
    properties: {
      platform: { type: "string", enum: ["bags"] },
      tokenMint: { type: "string", description: "Token mint address" },
      wallet: { type: "string", description: "Override wallet address" },
    },
    required: ["tokenMint"],
  },
};

const InputSchema = z.object({
  platform: z.literal("bags").optional(),
  tokenMint: z.string(),
  wallet: z.string().optional(),
});

export async function handleClaimFees(args: unknown, config: Config) {
  const input = InputSchema.parse(args);
  const solanaKey = config.walletSolana || (config.wallet?.type === "solana" ? config.wallet.key : null);
  if (!solanaKey) {
    throw new Error("Missing Solana wallet config: set ONELY_WALLET_SOLANA_KEY");
  }
  const wallet = await loadSolanaWallet(solanaKey);
  const walletAddress = input.wallet || wallet.publicKey.toBase58();

  const res = await fetchWithTimeout(`${config.apiBase}/api/bags/fees/claim-transactions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tokenMint: input.tokenMint,
      wallet: walletAddress,
    }),
  });
  await assertOk(res, "Claim fees failed");
  const raw = (await res.json()) as {
    response?: {
      transactionsBase64?: string[];
      totalAmount?: string;
      transactionType?: "legacy" | "versioned";
    };
    transactionsBase64?: string[];
    totalAmount?: string;
    transactionType?: "legacy" | "versioned";
  };
  const data = raw.response ?? raw;

  const connection = new Connection(config.solanaRpcUrl, "confirmed");
  const signatures: string[] = [];
  for (const txBase64 of data.transactionsBase64 || []) {
    const sig =
      data.transactionType === "legacy"
        ? await signAndSendLegacyTx(connection, txBase64, wallet)
        : await signAndSendVersionedTx(connection, txBase64, wallet);
    signatures.push(sig);
  }

  return mcpOk({
    tokenMint: input.tokenMint,
    wallet: walletAddress,
    totalAmount: data.totalAmount,
    signatures,
  });
}
