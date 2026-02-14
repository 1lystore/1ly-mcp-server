import { Keypair } from "@solana/web3.js";
import * as fs from "fs";
import { resolve, normalize } from "path";
import * as os from "os";
import { x402Client } from "@x402/core/client";
import { x402HTTPClient } from "@x402/core/http";
import { registerExactSvmScheme } from "@x402/svm/exact/client";
import { toClientSvmSigner } from "@x402/svm";
import { createKeyPairSignerFromBytes } from "@solana/signers";
import type { PaymentRequired } from "@x402/core/types";

function expandTilde(inputPath: string): string {
  if (!inputPath.startsWith("~/")) return inputPath;
  return resolve(os.homedir(), inputPath.slice(2));
}

/**
 * Validates wallet file path to prevent directory traversal attacks.
 * Only allows files in home directory or /tmp (for testing).
 */
function validateWalletPath(keyPath: string): void {
  try {
    const normalizedPath = normalize(resolve(keyPath));
    const homeDir = os.homedir();

    // Allow files in home directory or /tmp
    const isInHome = normalizedPath.startsWith(homeDir);
    const isInTmp = normalizedPath.startsWith("/tmp") || normalizedPath.startsWith(os.tmpdir());

    if (!isInHome && !isInTmp) {
      throw new Error(
        "Wallet file must be in home directory or /tmp for security. Path: " + normalizedPath
      );
    }

    // Block sensitive directories
    const blockedPaths = [".ssh", ".gnupg", ".aws", ".kube"];
    if (blockedPaths.some((p) => normalizedPath.includes(`/${p}/`))) {
      throw new Error("Cannot load wallet from sensitive directory");
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes("Wallet file must be")) {
      throw err;
    }
    throw new Error("Invalid wallet file path");
  }
}

export async function loadSolanaWallet(keyPath: string): Promise<Keypair> {
  let keyData: number[];

  if (keyPath.startsWith("[")) {
    // Inline JSON array format - no path validation needed
    keyData = JSON.parse(keyPath);
  } else {
    const expandedPath = expandTilde(keyPath);
    if (!fs.existsSync(expandedPath)) {
      throw new Error(`Wallet key file not found: ${keyPath}`);
    }
    // File path - validate before reading
    validateWalletPath(expandedPath);
    const fileContent = fs.readFileSync(expandedPath, "utf-8");
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
    headers["X-PAYMENT"] ||
    Buffer.from(JSON.stringify(paymentPayload)).toString("base64")
  );
}
