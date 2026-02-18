import { z } from "zod";
import type { Config } from "../config.js";
import { fetchWithTimeout, assertOk } from "../http.js";
import { McpToolError, mcpOk } from "../mcp.js";
import { loadSolanaWallet } from "../wallet/solana.js";
import { Connection } from "@solana/web3.js";
import { signAndSendVersionedTx } from "../solana-tx.js";
import { logSecurityEvent } from "../security-log.js";

const PROVIDERS = ["twitter", "github", "kick", "tiktok"] as const;
type Provider = (typeof PROVIDERS)[number];

export const launchTokenTool = {
  name: "1ly_launch_token",
  description:
    "Launch a token on Bags.fm (v2 flow). Handles metadata, fee config, launch tx, signing, and submission.",
  inputSchema: {
    type: "object" as const,
    properties: {
      platform: {
        type: "string",
        enum: ["bags"],
        description: "Token launch platform (currently only 'bags')",
      },
      name: { type: "string", description: "Token name" },
      symbol: { type: "string", description: "Token symbol" },
      description: { type: "string", description: "Token description" },
      imageUrl: { type: "string", description: "Image URL (preferred)" },
      imageBase64: { type: "string", description: "Base64 image (optional)" },
      twitter: { type: "string", description: "Twitter/X URL" },
      website: { type: "string", description: "Website URL" },
      telegram: { type: "string", description: "Telegram URL" },
      initialBuySol: {
        type: "number",
        description: "Initial buy amount in SOL (optional, default 0)",
      },
      feeClaimers: {
        type: "array",
        description: "Fee claimers (provider + username + bps)",
        items: {
          type: "object",
          properties: {
            provider: { type: "string", enum: ["twitter", "github", "kick", "tiktok"] },
            username: { type: "string" },
            bps: { type: "number", description: "Basis points (10000 = 100%, 1000 = 10%, 100 = 1%)" },
          },
          required: ["provider", "username", "bps"],
        },
      },
      share_fee: {
        type: "number",
        description: "Marketplace fee in bps (10000 = 100%)",
      },
    },
    required: ["name", "symbol"],
  },
};

const InputSchema = z.object({
  platform: z.literal("bags").optional().default("bags"),
  name: z.string().min(1).max(32),
  symbol: z.string().min(1).max(10),
  description: z.string().max(1000).optional(),
  imageUrl: z.string().url().optional(),
  imageBase64: z.string().optional(),
  twitter: z.string().url().optional(),
  website: z.string().url().optional(),
  telegram: z.string().url().optional(),
  initialBuySol: z.number().finite().nonnegative().optional(),
  feeClaimers: z
    .array(
      z.object({
        provider: z.enum(["twitter", "github", "kick", "tiktok"]),
        username: z.string().min(1),
        bps: z.number().int().positive(),
      })
    )
    .optional(),
  share_fee: z.number().int().min(0).max(10000).optional(),
}).refine((input) => Boolean(input.imageUrl || input.imageBase64), {
  message: "Provide either imageUrl or imageBase64",
});

function buildFeeShare(
  feeClaimers?: Array<{ provider: Provider; username: string; bps: number }>
) {
  if (!feeClaimers || feeClaimers.length === 0) {
    return { feeClaimers: [], creatorBps: 10_000 };
  }
  if (feeClaimers.length > 100) {
    throw new Error("Fee claimers exceed max limit (100)");
  }
  const total = feeClaimers.reduce((sum, c) => sum + c.bps, 0);
  if (total > 10_000) {
    throw new Error("Fee claimers total bps exceeds 10000");
  }
  const creatorBps = 10_000 - total;
  return { feeClaimers, creatorBps };
}

export async function handleLaunchToken(args: unknown, config: Config) {
  const input = InputSchema.parse(args);
  const solanaKey = config.walletSolana || (config.wallet?.type === "solana" ? config.wallet.key : null);
  if (!solanaKey) {
    throw new Error("Missing Solana wallet config: set ONELY_WALLET_SOLANA_KEY");
  }

  const wallet = await loadSolanaWallet(solanaKey);
  const creatorWallet = wallet.publicKey.toBase58();

  const { feeClaimers, creatorBps } = buildFeeShare(input.feeClaimers);
  let imageBase64: string | undefined;
  if (input.imageBase64) {
    const cleaned = input.imageBase64.replace(/\s+/g, "");
    const base64Regex =
      /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
    if (!base64Regex.test(cleaned)) {
      throw new Error("Invalid imageBase64 encoding");
    }
    const buffer = Buffer.from(cleaned, "base64");
    if (buffer.length === 0) {
      throw new Error("Invalid imageBase64 content");
    }
    const maxBytes = 15 * 1024 * 1024;
    if (buffer.length > maxBytes) {
      throw new Error("imageBase64 exceeds 15MB limit");
    }
    imageBase64 = cleaned;
  }

  const description =
    input.description && input.description.trim().length > 0
      ? input.description
      : "Token launched via 1ly.store";
  const initialBuySol = input.initialBuySol ?? 0;
  const initialBuyLamports = Math.round(initialBuySol * 1_000_000_000);

  const res = await fetchWithTimeout(`${config.apiBase}/api/bags/launch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    retries: 0,
    body: JSON.stringify({
      platform: "bags",
      name: input.name,
      symbol: input.symbol,
      description,
      imageUrl: input.imageUrl,
      imageBase64,
      socials: {
        twitter: input.twitter,
        website: input.website,
        telegram: input.telegram,
      },
      initialBuyLamports,
      feeClaimers,
      creatorBps,
      share_fee: input.share_fee,
      creatorWallet,
    }),
  });
  await assertOk(res, "Launch token failed");
  type LaunchPayload = {
    tokenMint: string;
    metadataUrl?: string;
    bagsUrl?: string;
    feeConfigKey?: string;
    launchTransactionBase64?: string | null;
    configTransactionsBase64?: string[];
    configBundlesBase64?: string[][];
  };
  const raw = (await res.json()) as LaunchPayload & { response?: LaunchPayload };
  const data: LaunchPayload = raw.response ?? raw;

  const connection = new Connection(config.solanaRpcUrl, "confirmed");
  for (const txBase64 of data.configTransactionsBase64 || []) {
    try {
      await signAndSendVersionedTx(connection, txBase64, wallet);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      throw new McpToolError(
        "Fee config transaction failed or is uncertain. Verify on-chain before retrying.",
        {
          code: "TX_UNCERTAIN",
          action: "verify_on_chain_before_retry",
          meta: { details: message },
        }
      );
    }
  }
  for (const bundle of data.configBundlesBase64 || []) {
    for (const txBase64 of bundle) {
      try {
        await signAndSendVersionedTx(connection, txBase64, wallet);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        throw new McpToolError(
          "Fee config bundle transaction failed or is uncertain. Verify on-chain before retrying.",
          {
            code: "TX_UNCERTAIN",
            action: "verify_on_chain_before_retry",
            meta: { details: message },
          }
        );
      }
    }
  }

  let launchTxBase64 = data.launchTransactionBase64 || null;
  if (!launchTxBase64) {
    const maxAttempts = 3;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (attempt > 0) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
      const launchRes = await fetchWithTimeout(`${config.apiBase}/api/bags/launch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        retries: 2,
        body: JSON.stringify({
          platform: "bags",
          tokenMint: data.tokenMint,
          metadataUrl: data.metadataUrl,
          configKey: data.feeConfigKey,
          creatorWallet,
          initialBuyLamports,
        }),
      });
      await assertOk(launchRes, "Launch transaction failed");
      type LaunchTxPayload = { launchTransactionBase64?: string };
      const launchRaw = (await launchRes.json()) as LaunchTxPayload & { response?: LaunchTxPayload };
      const launchData: LaunchTxPayload = launchRaw.response ?? launchRaw;
      if (launchData.launchTransactionBase64) {
        launchTxBase64 = launchData.launchTransactionBase64;
        break;
      }
    }
  }

  if (!launchTxBase64) {
    throw new Error("Launch transaction not returned by backend");
  }

  let txSignature: string;
  try {
    txSignature = await signAndSendVersionedTx(
      connection,
      launchTxBase64,
      wallet
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    throw new McpToolError(
      "Launch transaction failed or is uncertain. Verify on-chain before retrying.",
      {
        code: "TX_UNCERTAIN",
        action: "verify_on_chain_before_retry",
        meta: { details: message },
      }
    );
  }

  logSecurityEvent("token_launched", {
    platform: "bags",
    tokenMint: data.tokenMint,
    creatorWallet,
    txSignature,
  });

  return mcpOk({
    tokenMint: data.tokenMint,
    txSignature,
    metadataUrl: data.metadataUrl,
    bagsUrl: data.bagsUrl,
  });
}
