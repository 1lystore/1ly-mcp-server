/**
 * Provider selection and management
 *
 * Selection flow (evaluated top to bottom, first match wins):
 * 1. Explicit override (ONELY_PROVIDER env var)
 * 2. Auto-detect DCP (check localhost:8420)
 * 3. Env var fallback (DCP_VAULT_ID, ONELY_WALLET_PROVIDER, raw keys)
 */

import type { VaultProvider, Signer } from "./interface.js";
import { RawLocalProvider } from "./raw-local.js";
import { CoinbaseProvider } from "./coinbase.js";
import { DcpLocalProvider, checkDcpStatus } from "./dcp-local.js";
import { DcpRemoteProvider } from "./dcp-remote.js";
import { NoOpProvider } from "./noop.js";

// Negative cache for DCP availability check
let dcpCheckCache: { status: "responsive" | "locked" | "not_running"; expires: number } | null =
  null;
const DCP_NEGATIVE_CACHE_MS = 30000; // 30 seconds

async function getCachedDcpStatus(): Promise<"responsive" | "locked" | "not_running"> {
  const now = Date.now();

  if (dcpCheckCache && dcpCheckCache.expires > now) {
    return dcpCheckCache.status;
  }

  const status = await checkDcpStatus();

  // Cache negative results for 30s, positive results for 5s
  const ttl = status === "responsive" ? 5000 : DCP_NEGATIVE_CACHE_MS;
  dcpCheckCache = { status, expires: now + ttl };

  return status;
}

let cachedProvider: VaultProvider | null = null;

/**
 * Get the current vault provider
 */
export async function getProvider(): Promise<VaultProvider> {
  if (cachedProvider) {
    return cachedProvider;
  }

  const provider = await resolveProvider();
  cachedProvider = provider;
  return provider;
}

async function resolveProvider(): Promise<VaultProvider> {
  const explicit = process.env.ONELY_PROVIDER;

  // Step 1: Explicit override always wins
  if (explicit) {
    switch (explicit.toLowerCase()) {
      case "raw":
        return new RawLocalProvider({
          solanaKeyPath: process.env.ONELY_WALLET_SOLANA_KEY,
          evmKeyPath: process.env.ONELY_WALLET_EVM_KEY,
        });

      case "coinbase":
        return new CoinbaseProvider();

      case "dcp": {
        const dcpStatus = await getCachedDcpStatus();
        if (dcpStatus === "not_running") {
          throw new ProviderError(
            "ONELY_PROVIDER=dcp but DCP is not running at localhost:8420",
            "DCP_NOT_RUNNING"
          );
        }
        if (dcpStatus === "locked") {
          throw new ProviderError("DCP vault is locked. Unlock it to continue.", "VAULT_OFFLINE");
        }
        return new DcpLocalProvider();
      }

      case "remote": {
        const vaultId = process.env.DCP_VAULT_ID;
        if (!vaultId) {
          throw new ProviderError(
            "ONELY_PROVIDER=remote requires DCP_VAULT_ID env var",
            "MISSING_VAULT_ID"
          );
        }
        return new DcpRemoteProvider(vaultId);
      }

      default:
        throw new ProviderError(
          `Unknown ONELY_PROVIDER: ${explicit}. Valid: raw, coinbase, dcp, remote`,
          "INVALID_PROVIDER"
        );
    }
  }

  // Step 2: Auto-detect DCP
  const dcpStatus = await getCachedDcpStatus();

  // Prefer remote DCP if explicitly configured
  if (process.env.DCP_VAULT_ID) {
    return new DcpRemoteProvider(process.env.DCP_VAULT_ID);
  }

  if (dcpStatus === "responsive") {
    console.error("DCP detected at localhost:8420 — using DcpLocalProvider");
    return new DcpLocalProvider();
  }

  if (dcpStatus === "locked") {
    // DCP is installed but locked — do NOT fall back silently
    throw new ProviderError(
      "DCP vault is locked. Unlock it with your passphrase, or set ONELY_PROVIDER=raw to use env vars instead.",
      "VAULT_OFFLINE"
    );
  }

  // Step 3: Env var fallback (DCP not detected)
  if (process.env.ONELY_WALLET_PROVIDER === "coinbase") {
    return new CoinbaseProvider();
  }

  if (process.env.ONELY_WALLET_SOLANA_KEY || process.env.ONELY_WALLET_EVM_KEY) {
    return new RawLocalProvider({
      solanaKeyPath: process.env.ONELY_WALLET_SOLANA_KEY,
      evmKeyPath: process.env.ONELY_WALLET_EVM_KEY,
    });
  }

  // No provider configured
  console.error(`
No wallet configured. Options:

  1. Start DCP for consent-based signing:
     dcp init && npx @dcprotocol/server

  2. Use raw wallet env vars:
     ONELY_WALLET_SOLANA_KEY=~/.1ly/wallets/solana.json npx @1ly/mcp-server

Docs: https://docs.1ly.store/setup
`);

  return new NoOpProvider();
}

/**
 * Reset cached provider (for testing or config changes)
 */
export function resetProvider(): void {
  cachedProvider = null;
  dcpCheckCache = null;
}

/**
 * Get provider as Signer interface (for tools that only need signing)
 */
export async function getSigner(): Promise<Signer> {
  return getProvider();
}

/**
 * Provider-specific error
 */
export class ProviderError extends Error {
  constructor(
    message: string,
    public code: string
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

// Re-export types and utilities
export type { VaultProvider, Signer } from "./interface.js";
export { asSigner } from "./interface.js";
export { checkDcpStatus, DcpError } from "./dcp-local.js";
