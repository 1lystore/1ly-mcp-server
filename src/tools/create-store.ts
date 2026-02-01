import { z } from "zod";
import type { Config } from "../config.js";
import { fetchWithTimeout, assertOk } from "../http.js";
import { mcpOk } from "../mcp.js";
import { loadEvmWallet } from "../wallet/evm.js";
import { loadSolanaWallet } from "../wallet/solana.js";
import { createKeyPairSignerFromBytes, createSignableMessage } from "@solana/signers";
import { saveApiKey, getDefaultKeyPath } from "../keys.js";

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

async function signSolanaMessage(message: string, keyPath: string): Promise<string> {
  const wallet = await loadSolanaWallet(keyPath);
  const signer = await createKeyPairSignerFromBytes(wallet.secretKey);
  const signable = createSignableMessage(message);
  const [signatureDictionary] = await signer.signMessages([signable]);
  const signatureBytes = signatureDictionary[signer.address];
  if (!signatureBytes) {
    throw new Error("Failed to sign message with Solana wallet");
  }
  return Buffer.from(signatureBytes).toString("base64");
}

export async function handleCreateStore(args: unknown, config: Config) {
  const input = InputSchema.parse(args);
  const solanaKey = config.walletSolana || (config.wallet?.type === "solana" ? config.wallet.key : null);
  const evmKey = config.walletEvm || (config.wallet?.type === "evm" ? config.wallet.key : null);
  if (!solanaKey && !evmKey) {
    throw new Error(
      "Missing wallet config: set ONELY_WALLET_SOLANA_KEY or ONELY_WALLET_EVM_KEY (or legacy ONELY_WALLET_TYPE/KEY)"
    );
  }

  const chain =
    config.wallet?.type === "evm" || (!solanaKey && evmKey)
      ? "base"
      : "solana";
  let address: string;
  const evmAccount = chain === "base" ? await loadEvmWallet(evmKey!) : null;

  if (chain === "solana") {
    const wallet = await loadSolanaWallet(solanaKey!);
    address = wallet.publicKey.toBase58();
  } else {
    address = evmAccount!.address;
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

  const signature =
    chain === "solana"
      ? await signSolanaMessage(message, solanaKey!)
      : await evmAccount!.signMessage({ message });

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
    const store = data?.data?.store;
    const savedPath = await saveApiKey(apiKey, store);
    data.meta = {
      ...(data.meta || {}),
      savedKeyPath: savedPath || getDefaultKeyPath(),
    };
  }
  return mcpOk(data);
}
