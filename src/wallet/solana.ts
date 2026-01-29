import { Keypair } from "@solana/web3.js";
import * as fs from "fs";
import { x402Client } from "@x402/core/client";
import { x402HTTPClient } from "@x402/core/http";
import { registerExactSvmScheme } from "@x402/svm/exact/client";
import { toClientSvmSigner } from "@x402/svm";
import { createKeyPairSignerFromBytes } from "@solana/signers";
import type { PaymentRequired } from "@x402/core/types";

export async function loadSolanaWallet(keyPath: string): Promise<Keypair> {
  let keyData: number[];

  if (keyPath.startsWith("[")) {
    keyData = JSON.parse(keyPath);
  } else if (fs.existsSync(keyPath)) {
    const fileContent = fs.readFileSync(keyPath, "utf-8");
    const parsed = JSON.parse(fileContent);
    
    // Handle both formats:
    // 1. { publicKey: "...", secretKey: [...] } - test wallet format
    // 2. [...] - standard Solana keypair format
    if (Array.isArray(parsed)) {
      keyData = parsed;
    } else if (parsed.secretKey && Array.isArray(parsed.secretKey)) {
      keyData = parsed.secretKey;
    } else {
      throw new Error("Invalid wallet file format");
    }
  } else {
    throw new Error(`Wallet key file not found: ${keyPath}`);
  }

  return Keypair.fromSecretKey(Uint8Array.from(keyData));
}

export async function getWalletAddress(
  type: "solana" | "evm",
  key: string
): Promise<string> {
  if (type === "solana") {
    const wallet = await loadSolanaWallet(key);
    return wallet.publicKey.toBase58();
  }
  throw new Error("EVM wallet not yet implemented");
}

export async function buildSolanaPaymentSignature(
  paymentRequired: PaymentRequired,
  wallet: Keypair
): Promise<string> {
  const signer = await createKeyPairSignerFromBytes(wallet.secretKey);
  const svmSigner = toClientSvmSigner(signer);
  const coreClient = new x402Client((_, accepts) => {
    return (
      accepts.find((entry) => String(entry.network).startsWith("solana:")) ||
      accepts[0]
    );
  });
  registerExactSvmScheme(coreClient, { signer: svmSigner });
  const httpClient = new x402HTTPClient(coreClient);
  const paymentPayload = await httpClient.createPaymentPayload(paymentRequired);
  const headers = httpClient.encodePaymentSignatureHeader(paymentPayload);

  return (
    headers["PAYMENT-SIGNATURE"] ||
    headers["Payment-Signature"] ||
    headers["payment-signature"] ||
    headers["X-PAYMENT"]
  );
}
