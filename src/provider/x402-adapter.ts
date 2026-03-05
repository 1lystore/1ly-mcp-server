/**
 * x402 Adapter - Bridges VaultProvider into x402's expected signer interfaces
 *
 * Used for Raw/Coinbase providers when creating x402 payloads.
 * DCP providers use vault_sign_x402 directly (no adapter needed).
 */

import type { VaultProvider } from "./interface.js";

/**
 * x402 SVM Signer interface (from @x402/svm)
 */
export interface ClientSvmSigner {
  address: string;
  signTransaction: (tx: Uint8Array) => Promise<Uint8Array>;
  signMessage: (message: Uint8Array) => Promise<Uint8Array>;
}

/**
 * x402 EVM Signer interface (from @x402/evm)
 */
export interface ClientEvmSigner {
  address: string;
  signTypedData: (params: {
    domain: Record<string, unknown>;
    types: Record<string, unknown>;
    primaryType: string;
    message: Record<string, unknown>;
  }) => Promise<string>;
}

/**
 * Create an x402-compatible Solana signer from VaultProvider
 */
export async function toVaultSvmSigner(provider: VaultProvider): Promise<ClientSvmSigner> {
  const address = await provider.getPublicAddress("solana");

  return {
    address,
    signTransaction: async (tx: Uint8Array) => {
      return provider.signSolanaTransaction(tx);
    },
    signMessage: async (message: Uint8Array) => {
      const sig = await provider.signMessage(Buffer.from(message).toString("utf-8"), "solana");
      return Buffer.from(sig, "base64");
    },
  };
}

/**
 * Create an x402-compatible EVM signer from VaultProvider
 */
export async function toVaultEvmSigner(provider: VaultProvider): Promise<ClientEvmSigner> {
  const address = await provider.getPublicAddress("evm");

  return {
    address,
    signTypedData: async (params) => {
      return provider.signEvmTypedData({
        domain: params.domain,
        types: params.types,
        primaryType: params.primaryType,
        message: params.message,
      });
    },
  };
}
