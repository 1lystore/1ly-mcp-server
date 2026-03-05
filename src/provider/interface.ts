/**
 * VaultProvider abstraction for 1ly MCP Server
 *
 * Provides a unified interface for different signing backends:
 * - RawLocalProvider: env vars, no consent, no DCP
 * - CoinbaseProvider: Coinbase Agentic Wallet, Base only
 * - DcpLocalProvider: localhost:8420, full consent + budgets
 * - DcpRemoteProvider: relay (Phase 1)
 * - NoOpProvider: free tools only, no signing
 */

export interface X402SignParams {
  network: "solana" | "base";
  paymentPayload: Uint8Array;
  amount: string;
  currency: string;
  recipient: string;
  purpose: string;
  typedData?: EIP712TypedData;
}

export interface X402SignResult {
  signature: string;
  publicKey: string;
}

export interface BudgetCheckResult {
  allowed: boolean;
  remaining: number;
  currency: string;
  reason?: string;
}

export interface EIP712TypedData {
  domain: Record<string, unknown>;
  types: Record<string, unknown>;
  primaryType: string;
  message: Record<string, unknown>;
}

export type ProviderType = "raw" | "coinbase" | "dcp-local" | "dcp-remote" | "noop";

export interface VaultProvider {
  readonly type: ProviderType;

  /**
   * x402-specific signing with meaningful consent display in DCP
   */
  signX402Payment(params: X402SignParams): Promise<X402SignResult>;

  /**
   * Sign raw Solana transaction bytes
   */
  signSolanaTransaction(unsignedTx: Uint8Array): Promise<Uint8Array>;

  /**
   * Sign raw Solana payload (for generic signing)
   */
  signSolanaPayload(payload: Uint8Array): Promise<Uint8Array>;

  /**
   * Sign EIP-712 typed data (for Base/EVM)
   */
  signEvmTypedData(typedData: EIP712TypedData): Promise<string>;

  /**
   * Sign a message (utf8)
   */
  signMessage(message: string, chain: "solana" | "evm"): Promise<string>;

  /**
   * Read a credential from storage (requires consent in DCP mode)
   */
  readCredential(scope: string): Promise<string | null>;

  /**
   * Write a credential to storage (requires consent in DCP mode)
   */
  writeCredential(scope: string, value: string): Promise<void>;

  /**
   * Read data from storage (requires consent in DCP mode)
   */
  readData(scope: string): Promise<Record<string, unknown> | null>;

  /**
   * Get public wallet address (no consent needed)
   */
  getPublicAddress(chain: "solana" | "evm"): Promise<string>;

  /**
   * Check if operation is within budget (DCP is authoritative in DCP mode)
   */
  checkBudget(
    amount: number,
    currency: string,
    chain?: "solana" | "base" | "ethereum"
  ): Promise<BudgetCheckResult>;

  /**
   * Check if the provider is available and ready to sign
   */
  isAvailable(): Promise<boolean>;
}

/**
 * Narrow interface for tool handlers that only need signing
 */
export interface Signer {
  readonly type: ProviderType;

  signX402Payment(params: X402SignParams): Promise<X402SignResult>;
  signSolanaTransaction(tx: Uint8Array): Promise<Uint8Array>;
  signEvmTypedData(typedData: EIP712TypedData): Promise<string>;
  signMessage(message: string, chain: "solana" | "evm"): Promise<string>;
  getPublicAddress(chain: "solana" | "evm"): Promise<string>;
}

/**
 * Helper to narrow VaultProvider to Signer interface
 */
export function asSigner(provider: VaultProvider): Signer {
  return provider;
}
