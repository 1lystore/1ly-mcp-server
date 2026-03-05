/**
 * CoinbaseProvider - Coinbase Agentic Wallet integration
 *
 * Extracted from existing agentic.ts. Base network only.
 * Uses IPC via file-based requests/responses.
 */

import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

import type {
  VaultProvider,
  X402SignParams,
  X402SignResult,
  BudgetCheckResult,
  EIP712TypedData,
} from "./interface.js";
import { loadConfig } from "../config.js";
import { loadStoredApiKey, saveApiKey } from "../keys.js";

const IPC_DIR = "/tmp/payments-mcp-ui-bridge";
const REQUESTS_DIR = path.join(IPC_DIR, "requests");
const RESPONSES_DIR = path.join(IPC_DIR, "responses");

interface AgenticWalletRequest {
  baseURL: string;
  path: string;
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  queryParams?: Record<string, string>;
  body?: unknown;
  headers?: Record<string, string>;
  maxAmountPerRequest?: number;
  paymentRequirements?: Array<Record<string, unknown>>;
}

interface AgenticWalletResponse {
  status: number;
  statusText?: string;
  data?: unknown;
  headers?: Record<string, string>;
}

function ensureIpcDirs(): void {
  if (!fs.existsSync(IPC_DIR)) fs.mkdirSync(IPC_DIR, { mode: 0o700 });
  if (!fs.existsSync(REQUESTS_DIR)) fs.mkdirSync(REQUESTS_DIR, { mode: 0o700 });
  if (!fs.existsSync(RESPONSES_DIR)) fs.mkdirSync(RESPONSES_DIR, { mode: 0o700 });
}

async function waitForResponseFile(filePath: string, timeoutMs: number): Promise<void> {
  if (fs.existsSync(filePath)) return;
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      watcher.close();
      reject(new Error("Agentic Wallet IPC timeout"));
    }, timeoutMs);

    const watcher = fs.watch(RESPONSES_DIR, (eventType, filename) => {
      if (filename === path.basename(filePath)) {
        clearTimeout(timeout);
        watcher.close();
        resolve();
      }
    });
  });
}

async function sendAgenticIpcRequest<T>(
  channel: string,
  data: unknown,
  timeoutMs: number
): Promise<T> {
  ensureIpcDirs();

  const originalTitle = process.title;
  process.title = "awal-cli";

  const requestId = randomUUID();
  const requestFile = path.join(REQUESTS_DIR, `${requestId}.json`);
  const responseFile = path.join(RESPONSES_DIR, `${requestId}.json`);

  try {
    const payload = {
      id: requestId,
      channel,
      data,
      timestamp: Date.now(),
      pid: process.pid,
      processTitle: process.title,
    };

    fs.writeFileSync(requestFile, JSON.stringify(payload, null, 2), { mode: 0o600 });

    await waitForResponseFile(responseFile, timeoutMs);

    const responseData = fs.readFileSync(responseFile, "utf-8");
    const response = JSON.parse(responseData) as {
      result?: T;
      error?: string | object;
    };

    try {
      fs.unlinkSync(responseFile);
    } catch {
      // ignore cleanup errors
    }

    if (response.error) {
      const message =
        typeof response.error === "string" ? response.error : JSON.stringify(response.error);
      throw new Error(message);
    }

    if (!response.result) {
      throw new Error("Agentic Wallet IPC returned empty result");
    }

    return response.result;
  } finally {
    process.title = originalTitle;
  }
}

export class CoinbaseProvider implements VaultProvider {
  readonly type = "coinbase" as const;

  private cachedAddress: string | null = null;

  async signX402Payment(params: X402SignParams): Promise<X402SignResult> {
    if (params.network === "solana") {
      throw new Error("Agentic Wallet only supports Base network. Use Solana with raw wallet keys.");
    }

    // Use IPC to make the x402 request via Agentic Wallet
    const request: AgenticWalletRequest = {
      baseURL: "https://1ly.store",
      path: "/api/link/" + params.purpose,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      paymentRequirements: [
        {
          scheme: "exact",
          network: "eip155:8453",
          amount: params.amount,
          payTo: params.recipient,
          asset: params.currency,
        },
      ],
    };

    const response = await sendAgenticIpcRequest<AgenticWalletResponse>(
      "make-x402-request",
      request,
      30000
    );

    // Extract payment signature from response headers
    const signature =
      response.headers?.["payment-signature"] ||
      response.headers?.["PAYMENT-SIGNATURE"] ||
      response.headers?.["Payment-Signature"] ||
      "";

    const address = await this.getPublicAddress("evm");

    return {
      signature,
      publicKey: address,
    };
  }

  async signSolanaTransaction(_unsignedTx: Uint8Array): Promise<Uint8Array> {
    throw new Error("Agentic Wallet only supports Base network");
  }

  async signSolanaPayload(_payload: Uint8Array): Promise<Uint8Array> {
    throw new Error("Agentic Wallet only supports Base network");
  }

  async signEvmTypedData(_typedData: EIP712TypedData): Promise<string> {
    // Coinbase Agentic Wallet handles signing internally via IPC
    throw new Error(
      "Direct EVM typed data signing not supported. Use signX402Payment for payments."
    );
  }

  async signMessage(_message: string, chain: "solana" | "evm"): Promise<string> {
    if (chain === "solana") {
      throw new Error("Agentic Wallet only supports Base network");
    }
    throw new Error("Message signing via Agentic Wallet not yet implemented");
  }

  async readCredential(scope: string): Promise<string | null> {
    if (scope === "credentials.api.1ly") {
      const envKey = process.env.ONELY_API_KEY;
      if (envKey) return envKey;
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
      return { network: "base" }; // Coinbase only supports Base
    }
    return null;
  }

  async getPublicAddress(chain: "solana" | "evm"): Promise<string> {
    if (chain === "solana") {
      throw new Error("Agentic Wallet only supports Base network");
    }

    if (this.cachedAddress) {
      return this.cachedAddress;
    }

    const result = await sendAgenticIpcRequest<unknown>(
      "get-wallet-address",
      undefined,
      30000
    );

    if (typeof result === "string") {
      this.cachedAddress = result;
      return result;
    }

    if (
      result &&
      typeof result === "object" &&
      "address" in result &&
      typeof (result as { address?: unknown }).address === "string"
    ) {
      this.cachedAddress = (result as { address: string }).address;
      return this.cachedAddress;
    }

    throw new Error("Agentic Wallet returned an invalid address");
  }

  async checkBudget(
    amount: number,
    currency: string,
    _chain?: "solana" | "base" | "ethereum"
  ): Promise<BudgetCheckResult> {
    // Coinbase Agentic Wallet has its own budget management
    // For now, use local config as fallback
    const config = loadConfig();

    if (amount > config.budgets.perCall) {
      return {
        allowed: false,
        remaining: config.budgets.daily,
        currency,
        reason: `Amount $${amount.toFixed(4)} exceeds per-call budget of $${config.budgets.perCall}`,
      };
    }

    return {
      allowed: true,
      remaining: config.budgets.daily,
      currency,
    };
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.getPublicAddress("evm");
      return true;
    } catch {
      return false;
    }
  }
}
