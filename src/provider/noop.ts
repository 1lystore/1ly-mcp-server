/**
 * NoOpProvider - No wallet configured
 *
 * Used when no wallet is available. Free tools work, paid tools fail gracefully.
 */

import type {
  VaultProvider,
  X402SignParams,
  X402SignResult,
  BudgetCheckResult,
  EIP712TypedData,
} from "./interface.js";

const NO_WALLET_ERROR = "No wallet configured. Set ONELY_WALLET_SOLANA_KEY or start DCP.";

export class NoOpProvider implements VaultProvider {
  readonly type = "noop" as const;

  async signX402Payment(_params: X402SignParams): Promise<X402SignResult> {
    throw new Error(NO_WALLET_ERROR);
  }

  async signSolanaTransaction(_unsignedTx: Uint8Array): Promise<Uint8Array> {
    throw new Error(NO_WALLET_ERROR);
  }

  async signSolanaPayload(_payload: Uint8Array): Promise<Uint8Array> {
    throw new Error(NO_WALLET_ERROR);
  }

  async signEvmTypedData(_typedData: EIP712TypedData): Promise<string> {
    throw new Error(NO_WALLET_ERROR);
  }

  async signMessage(_message: string, _chain: "solana" | "evm"): Promise<string> {
    throw new Error(NO_WALLET_ERROR);
  }

  async readCredential(_scope: string): Promise<string | null> {
    return null;
  }

  async writeCredential(_scope: string, _value: string): Promise<void> {
    // No-op, nowhere to write
  }

  async readData(_scope: string): Promise<Record<string, unknown> | null> {
    return null;
  }

  async getPublicAddress(_chain: "solana" | "evm"): Promise<string> {
    throw new Error(NO_WALLET_ERROR);
  }

  async checkBudget(
    _amount: number,
    _currency: string,
    _chain?: "solana" | "base" | "ethereum"
  ): Promise<BudgetCheckResult> {
    // No wallet = unlimited budget (for free tools)
    return { allowed: true, remaining: Infinity, currency: "USD" };
  }

  async isAvailable(): Promise<boolean> {
    return false;
  }
}
