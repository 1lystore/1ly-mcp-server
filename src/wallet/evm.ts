import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { base, baseSepolia } from "viem/chains";
import { x402Client } from "@x402/core/client";
import { x402HTTPClient } from "@x402/core/http";
import { ExactEvmScheme } from "@x402/evm";
import * as fs from "fs";
import type { PaymentRequired } from "@x402/core/types";

// Determine network from env
const IS_TESTNET = process.env.BASE_NETWORK === "sepolia" || process.env.NODE_ENV !== "production";
const CHAIN = IS_TESTNET ? baseSepolia : base;

export async function loadEvmWallet(keyInput: string): Promise<PrivateKeyAccount> {
  let privateKey: `0x${string}`;

  if (keyInput.startsWith("0x")) {
    privateKey = keyInput as `0x${string}`;
  } else if (fs.existsSync(keyInput)) {
    const content = fs.readFileSync(keyInput, "utf-8").trim();
    privateKey = (content.startsWith("0x") ? content : `0x${content}`) as `0x${string}`;
  } else {
    throw new Error(`EVM wallet key file not found: ${keyInput}`);
  }

  return privateKeyToAccount(privateKey);
}

export async function getEvmWalletAddress(keyInput: string): Promise<string> {
  const account = await loadEvmWallet(keyInput);
  return account.address;
}

interface PaymentRequirements {
  maxAmountRequired?: string;
  amount?: string;
  payTo?: string;
  receiver?: string;
  x402Version?: number;
  scheme?: string;
  network?: string;
  asset?: string;
}

interface Body402 {
  x402Version?: number;
  accepts?: Array<{
    scheme: string;
    network: string;
    amount?: string;
    maxAmountRequired?: string;
    payTo: string;
    asset?: string;
    maxTimeoutSeconds?: number;
    extra?: Record<string, unknown>;
  }>;
  resource?: {
    url: string;
    description?: string;
    mimeType?: string;
  };
}

function resolvePaymentRequired(
  httpClient: x402HTTPClient,
  responseBody: Body402
) {
  // @x402/core only accepts v2 via PAYMENT-REQUIRED header; use body directly when present.
  if (responseBody && responseBody.x402Version && responseBody.x402Version !== 1) {
    return responseBody as unknown as Parameters<typeof httpClient.createPaymentPayload>[0];
  }
  return httpClient.getPaymentRequiredResponse(() => null, responseBody);
}

/**
 * Build EVM payment using @x402/evm library
 * This matches the format used by the frontend DynamicX402Client
 */
export async function buildEvmPayment(
  requirements: PaymentRequirements,
  account: PrivateKeyAccount,
  body402?: Body402
): Promise<string> {
  // Create EVM signer compatible with @x402/evm
  const evmSigner = {
    address: account.address,
    signTypedData: async (params: {
      domain: Record<string, unknown>;
      types: Record<string, unknown>;
      primaryType: string;
      message: Record<string, unknown>;
    }) => {
      const { signTypedData } = await import("viem/accounts");
      return signTypedData({
        privateKey: (account as unknown as { source: string }).source === "privateKey" 
          ? (account as unknown as { privateKey: `0x${string}` }).privateKey
          : await getPrivateKeyFromAccount(account),
        domain: params.domain as Parameters<typeof signTypedData>[0]["domain"],
        types: params.types as Parameters<typeof signTypedData>[0]["types"],
        primaryType: params.primaryType as string,
        message: params.message as Record<string, unknown>,
      });
    },
  };

  // Build x402 client with EVM scheme
  const coreClient = new x402Client().register("eip155:*", new ExactEvmScheme(evmSigner as never));
  const httpClient = new x402HTTPClient(coreClient);

  // Reconstruct the 402 response body if not provided
  const responseBody: Body402 = body402 || {
    x402Version: requirements.x402Version || 2,
    accepts: [{
      scheme: requirements.scheme || "exact",
      network: requirements.network || `eip155:${CHAIN.id}`,
      amount: requirements.maxAmountRequired || requirements.amount || "0",
      payTo: requirements.payTo || requirements.receiver || "",
      asset: requirements.asset,
      maxTimeoutSeconds: 300,
    }],
    resource: {
      url: "https://1ly.store/api",
      description: "API access",
      mimeType: "application/json",
    },
  };

  // Parse payment required response
  const paymentRequired = resolvePaymentRequired(httpClient, responseBody);

  // Create payment payload (signs EIP-712)
  const paymentPayload = await httpClient.createPaymentPayload(paymentRequired);

  // Encode as header value
  const headers = httpClient.encodePaymentSignatureHeader(paymentPayload);
  
  // Get the payment header value (try different header names)
  const paymentValue = 
    headers["PAYMENT-SIGNATURE"] ||
    headers["Payment-Signature"] ||
    headers["payment-signature"] ||
    headers["X-PAYMENT"];

  if (!paymentValue) {
    // If using older format, encode the whole payload
    return Buffer.from(JSON.stringify(paymentPayload)).toString("base64");
  }

  return paymentValue;
}

// Helper to extract private key from account
async function getPrivateKeyFromAccount(account: PrivateKeyAccount): Promise<`0x${string}`> {
  // This is a workaround - viem doesn't expose privateKey directly on the account
  // In practice, we store it when loading
  throw new Error("Cannot extract private key from account. Use loadEvmWallet directly.");
}

// Store private key reference for signing
let storedPrivateKey: `0x${string}` | null = null;

export async function loadEvmWalletWithKey(keyInput: string): Promise<{ account: PrivateKeyAccount; privateKey: `0x${string}` }> {
  let privateKey: `0x${string}`;

  if (keyInput.startsWith("0x")) {
    privateKey = keyInput as `0x${string}`;
  } else if (fs.existsSync(keyInput)) {
    const content = fs.readFileSync(keyInput, "utf-8").trim();
    privateKey = (content.startsWith("0x") ? content : `0x${content}`) as `0x${string}`;
  } else {
    throw new Error(`EVM wallet key file not found: ${keyInput}`);
  }

  storedPrivateKey = privateKey;
  return { account: privateKeyToAccount(privateKey), privateKey };
}

/**
 * Simplified EVM payment builder that works with stored private key
 */
export async function buildEvmPaymentSimple(
  requirements: PaymentRequirements,
  keyInput: string,
  body402?: Body402
): Promise<string> {
  const { privateKey } = await loadEvmWalletWithKey(keyInput);
  const account = privateKeyToAccount(privateKey);
  
  const evmSigner = {
    address: account.address,
    signTypedData: async (params: {
      domain: Record<string, unknown>;
      types: Record<string, unknown>;
      primaryType: string;
      message: Record<string, unknown>;
    }) => {
      const { signTypedData } = await import("viem/accounts");
      return signTypedData({
        privateKey,
        domain: params.domain as Parameters<typeof signTypedData>[0]["domain"],
        types: params.types as Parameters<typeof signTypedData>[0]["types"],
        primaryType: params.primaryType as string,
        message: params.message as Record<string, unknown>,
      });
    },
  };

  const coreClient = new x402Client().register("eip155:*", new ExactEvmScheme(evmSigner as never));
  const httpClient = new x402HTTPClient(coreClient);

  const responseBody: Body402 = body402 || {
    x402Version: requirements.x402Version || 2,
    accepts: [{
      scheme: requirements.scheme || "exact",
      network: requirements.network || `eip155:${CHAIN.id}`,
      amount: requirements.maxAmountRequired || requirements.amount || "0",
      payTo: requirements.payTo || requirements.receiver || "",
      asset: requirements.asset,
      maxTimeoutSeconds: 300,
    }],
    resource: {
      url: "https://1ly.store/api",
      description: "API access",
      mimeType: "application/json",
    },
  };

  const paymentRequired = resolvePaymentRequired(httpClient, responseBody);
  const paymentPayload = await httpClient.createPaymentPayload(paymentRequired);
  const headers = httpClient.encodePaymentSignatureHeader(paymentPayload);
  
  return headers["PAYMENT-SIGNATURE"] || 
         headers["Payment-Signature"] || 
         headers["X-PAYMENT"] ||
         Buffer.from(JSON.stringify(paymentPayload)).toString("base64");
}

export async function buildEvmPaymentSignature(
  paymentRequired: PaymentRequired,
  keyInput: string
): Promise<string> {
  const { privateKey } = await loadEvmWalletWithKey(keyInput);
  const account = privateKeyToAccount(privateKey);

  const evmSigner = {
    address: account.address,
    signTypedData: async (params: {
      domain: Record<string, unknown>;
      types: Record<string, unknown>;
      primaryType: string;
      message: Record<string, unknown>;
    }) => {
      const { signTypedData } = await import("viem/accounts");
      return signTypedData({
        privateKey,
        domain: params.domain as Parameters<typeof signTypedData>[0]["domain"],
        types: params.types as Parameters<typeof signTypedData>[0]["types"],
        primaryType: params.primaryType as string,
        message: params.message as Record<string, unknown>,
      });
    },
  };

  const coreClient = new x402Client((_, accepts) => {
    return accepts.find((entry) => String(entry.network).startsWith("eip155:")) || accepts[0];
  }).register("eip155:*", new ExactEvmScheme(evmSigner as never));
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
