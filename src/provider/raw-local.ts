/**
 * RawLocalProvider - Uses raw wallet keys from env vars
 *
 * Extracted from existing wallet code. Zero behavior change.
 * No consent, no DCP, uses env vars and local budget.ts.
 */

import { Keypair, VersionedTransaction } from "@solana/web3.js";
import { privateKeyToAccount, signTypedData } from "viem/accounts";
import type { PrivateKeyAccount } from "viem/accounts";
import * as fs from "fs";
import { resolve, normalize } from "path";
import * as os from "os";

import { x402Client } from "@x402/core/client";
import { x402HTTPClient } from "@x402/core/http";
import { registerExactSvmScheme } from "@x402/svm/exact/client";
import { toClientSvmSigner } from "@x402/svm";
import { ExactEvmScheme } from "@x402/evm";
import { createKeyPairSignerFromBytes } from "@solana/signers";
import type { PaymentRequired } from "@x402/core/types";
import * as nacl from "tweetnacl";

import type {
  VaultProvider,
  X402SignParams,
  X402SignResult,
  BudgetCheckResult,
  EIP712TypedData,
} from "./interface.js";
import { loadConfig } from "../config.js";
import { loadStoredApiKey, saveApiKey } from "../keys.js";

function expandTilde(inputPath: string): string {
  if (!inputPath.startsWith("~/")) return inputPath;
  return resolve(os.homedir(), inputPath.slice(2));
}

function validateWalletPath(keyPath: string): void {
  try {
    const normalizedPath = normalize(resolve(keyPath));
    const homeDir = os.homedir();

    const isInHome = normalizedPath.startsWith(homeDir);
    const isInTmp =
      normalizedPath.startsWith("/tmp") || normalizedPath.startsWith(os.tmpdir());

    if (!isInHome && !isInTmp) {
      throw new Error(
        "Wallet file must be in home directory or /tmp for security. Path: " +
          normalizedPath
      );
    }

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

function loadSolanaKeypair(keyPath: string): Keypair {
  let keyData: number[];

  if (keyPath.startsWith("[")) {
    keyData = JSON.parse(keyPath);
  } else {
    const expandedPath = expandTilde(keyPath);
    if (!fs.existsSync(expandedPath)) {
      throw new Error(`Wallet key file not found: ${keyPath}`);
    }
    validateWalletPath(expandedPath);
    const fileContent = fs.readFileSync(expandedPath, "utf-8");
    const parsed = JSON.parse(fileContent);

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

function loadEvmAccount(keyInput: string): { account: PrivateKeyAccount; privateKey: `0x${string}` } {
  let privateKey: `0x${string}`;

  if (keyInput.startsWith("0x")) {
    privateKey = keyInput as `0x${string}`;
  } else if (fs.existsSync(expandTilde(keyInput))) {
    const expandedPath = expandTilde(keyInput);
    validateWalletPath(expandedPath);
    const content = fs.readFileSync(expandedPath, "utf-8").trim();
    privateKey = (content.startsWith("0x") ? content : `0x${content}`) as `0x${string}`;
  } else {
    throw new Error(`EVM wallet key file not found: ${keyInput}`);
  }

  return { account: privateKeyToAccount(privateKey), privateKey };
}

interface BudgetState {
  date: string;
  spentToday: number;
}

function getBudgetStatePath(): string {
  const envPath = process.env.ONELY_BUDGET_STATE_FILE;
  if (envPath && envPath.trim().length > 0) {
    if (envPath.startsWith("~/")) {
      return resolve(os.homedir(), envPath.slice(2));
    }
    return envPath;
  }
  return resolve(os.homedir(), ".1ly-mcp-budget.json");
}

function loadBudgetState(): BudgetState {
  const filePath = getBudgetStatePath();

  try {
    if (!fs.existsSync(filePath)) {
      return { date: new Date().toISOString().slice(0, 10), spentToday: 0 };
    }

    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw) as BudgetState;
    const today = new Date().toISOString().slice(0, 10);

    if (!parsed.date || typeof parsed.spentToday !== "number" || parsed.date !== today) {
      return { date: today, spentToday: 0 };
    }

    return parsed;
  } catch {
    return { date: new Date().toISOString().slice(0, 10), spentToday: 0 };
  }
}

export class RawLocalProvider implements VaultProvider {
  readonly type = "raw" as const;

  private solanaKeypair: Keypair | null = null;
  private evmPrivateKey: `0x${string}` | null = null;
  private evmAccount: PrivateKeyAccount | null = null;

  constructor(config?: { solanaKeyPath?: string | null; evmKeyPath?: string | null }) {
    if (config?.solanaKeyPath) {
      try {
        this.solanaKeypair = loadSolanaKeypair(config.solanaKeyPath);
      } catch {
        this.solanaKeypair = null;
      }
    }

    if (config?.evmKeyPath) {
      try {
        const { account, privateKey } = loadEvmAccount(config.evmKeyPath);
        this.evmAccount = account;
        this.evmPrivateKey = privateKey;
      } catch {
        this.evmAccount = null;
        this.evmPrivateKey = null;
      }
    }
  }

  async signX402Payment(params: X402SignParams): Promise<X402SignResult> {
    if (params.network === "solana") {
      if (!this.solanaKeypair) {
        throw new Error("Solana wallet not configured");
      }

      const signer = await createKeyPairSignerFromBytes(this.solanaKeypair.secretKey);
      const svmSigner = toClientSvmSigner(signer);

      const coreClient = new x402Client((_, accepts) => {
        return (
          accepts.find((entry) => String(entry.network).startsWith("solana:")) ||
          accepts[0]
        );
      });
      registerExactSvmScheme(coreClient, { signer: svmSigner });

      const httpClient = new x402HTTPClient(coreClient);

      // Reconstruct PaymentRequired from params
      const paymentRequired = {
        x402Version: 2,
        accepts: [
          {
            scheme: "exact",
            network: "solana:mainnet",
            amount: params.amount,
            payTo: params.recipient,
            asset: params.currency,
            maxTimeoutSeconds: 300,
          },
        ],
        resource: {
          url: params.purpose,
          description: params.purpose,
        },
      } as unknown as PaymentRequired;

      const paymentPayload = await httpClient.createPaymentPayload(paymentRequired);
      const headers = httpClient.encodePaymentSignatureHeader(paymentPayload);

      const signature =
        headers["PAYMENT-SIGNATURE"] ||
        headers["Payment-Signature"] ||
        headers["payment-signature"] ||
        headers["X-PAYMENT"] ||
        Buffer.from(JSON.stringify(paymentPayload)).toString("base64");

      return {
        signature,
        publicKey: this.solanaKeypair.publicKey.toBase58(),
      };
    }

    // Base/EVM
    if (!this.evmAccount || !this.evmPrivateKey) {
      throw new Error("EVM wallet not configured");
    }

    const evmSigner = {
      address: this.evmAccount.address,
      signTypedData: async (p: {
        domain: Record<string, unknown>;
        types: Record<string, unknown>;
        primaryType: string;
        message: Record<string, unknown>;
      }) => {
        return signTypedData({
          privateKey: this.evmPrivateKey!,
          domain: p.domain as Parameters<typeof signTypedData>[0]["domain"],
          types: p.types as Parameters<typeof signTypedData>[0]["types"],
          primaryType: p.primaryType,
          message: p.message,
        });
      },
    };

    const coreClient = new x402Client((_, accepts) => {
      return accepts.find((entry) => String(entry.network).startsWith("eip155:")) || accepts[0];
    }).register("eip155:*", new ExactEvmScheme(evmSigner as never));

    const httpClient = new x402HTTPClient(coreClient);

    const paymentRequired = {
      x402Version: 2,
      accepts: [
        {
          scheme: "exact",
          network: "eip155:8453", // Base mainnet
          amount: params.amount,
          payTo: params.recipient,
          asset: params.currency,
          maxTimeoutSeconds: 300,
        },
      ],
      resource: {
        url: params.purpose,
        description: params.purpose,
      },
    } as unknown as PaymentRequired;

    const paymentPayload = await httpClient.createPaymentPayload(paymentRequired);
    const headers = httpClient.encodePaymentSignatureHeader(paymentPayload);

    const signature =
      headers["PAYMENT-SIGNATURE"] ||
      headers["Payment-Signature"] ||
      headers["payment-signature"] ||
      headers["X-PAYMENT"] ||
      Buffer.from(JSON.stringify(paymentPayload)).toString("base64");

    return {
      signature,
      publicKey: this.evmAccount.address,
    };
  }

  async signSolanaTransaction(unsignedTx: Uint8Array): Promise<Uint8Array> {
    if (!this.solanaKeypair) {
      throw new Error("Solana wallet not configured");
    }

    const tx = VersionedTransaction.deserialize(unsignedTx);
    tx.sign([this.solanaKeypair]);
    return tx.serialize();
  }

  async signSolanaPayload(payload: Uint8Array): Promise<Uint8Array> {
    if (!this.solanaKeypair) {
      throw new Error("Solana wallet not configured");
    }

    // Use nacl for raw message signing
    const signature = nacl.sign.detached(payload, this.solanaKeypair.secretKey);
    return signature;
  }

  async signEvmTypedData(typedData: EIP712TypedData): Promise<string> {
    if (!this.evmPrivateKey) {
      throw new Error("EVM wallet not configured");
    }

    return signTypedData({
      privateKey: this.evmPrivateKey,
      domain: typedData.domain as Parameters<typeof signTypedData>[0]["domain"],
      types: typedData.types as Parameters<typeof signTypedData>[0]["types"],
      primaryType: typedData.primaryType,
      message: typedData.message,
    });
  }

  async signMessage(message: string, chain: "solana" | "evm"): Promise<string> {
    if (chain === "solana") {
      if (!this.solanaKeypair) {
        throw new Error("Solana wallet not configured");
      }

      // Use nacl for message signing
      const messageBytes = new TextEncoder().encode(message);
      const signature = nacl.sign.detached(messageBytes, this.solanaKeypair.secretKey);
      return Buffer.from(signature).toString("base64");
    }

    if (!this.evmPrivateKey) {
      throw new Error("EVM wallet not configured");
    }

    const { signMessage: viemSignMessage } = await import("viem/accounts");
    return viemSignMessage({
      privateKey: this.evmPrivateKey,
      message,
    });
  }

  async readCredential(scope: string): Promise<string | null> {
    if (scope === "credentials.api.1ly") {
      // Check env var first
      const envKey = process.env.ONELY_API_KEY;
      if (envKey) return envKey;

      // Fall back to stored key file
      return loadStoredApiKey();
    }
    return null;
  }

  async writeCredential(scope: string, value: string): Promise<void> {
    if (scope === "credentials.api.1ly") {
      await saveApiKey(value);
    }
  }

  async readData(scope: string): Promise<Record<string, unknown> | null> {
    if (scope === "preferences.network") {
      return { network: process.env.ONELY_NETWORK || "solana" };
    }
    return null;
  }

  async getPublicAddress(chain: "solana" | "evm"): Promise<string> {
    if (chain === "solana") {
      if (!this.solanaKeypair) {
        throw new Error("Solana wallet not configured");
      }
      return this.solanaKeypair.publicKey.toBase58();
    }

    if (!this.evmAccount) {
      throw new Error("EVM wallet not configured");
    }
    return this.evmAccount.address;
  }

  async checkBudget(
    amount: number,
    currency: string,
    _chain?: "solana" | "base" | "ethereum"
  ): Promise<BudgetCheckResult> {
    const config = loadConfig();
    const state = loadBudgetState();
    const today = new Date().toISOString().slice(0, 10);

    const current = state.date === today ? state.spentToday : 0;
    const remaining = config.budgets.daily - current;

    // Check per-call limit
    if (amount > config.budgets.perCall) {
      return {
        allowed: false,
        remaining,
        currency,
        reason: `Price $${amount.toFixed(4)} exceeds per-call budget of $${config.budgets.perCall}`,
      };
    }

    // Check daily limit
    if (current + amount > config.budgets.daily) {
      return {
        allowed: false,
        remaining,
        currency,
        reason: `Price $${amount.toFixed(4)} would exceed daily budget of $${config.budgets.daily} (spent: $${current.toFixed(4)})`,
      };
    }

    return {
      allowed: true,
      remaining: remaining - amount,
      currency,
    };
  }

  async isAvailable(): Promise<boolean> {
    return this.solanaKeypair !== null || this.evmAccount !== null;
  }
}
