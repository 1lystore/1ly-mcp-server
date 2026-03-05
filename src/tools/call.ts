import { z } from "zod";
import type { Config } from "../config.js";
import { buildSolanaPaymentSignature, loadSolanaWallet } from "../wallet/solana.js";
import { buildEvmPaymentSignature } from "../wallet/evm.js";
import { makeX402RequestViaAgenticWallet } from "../wallet/agentic.js";
import { fetchWithTimeout, assertOk } from "../http.js";
import { checkAndRecordDailySpend } from "../budget.js";
import { mcpOk, McpToolError } from "../mcp.js";
import { x402Client } from "@x402/core/client";
import { x402HTTPClient } from "@x402/core/http";
import type { PaymentRequired } from "@x402/core/types";
import { registerExactSvmScheme } from "@x402/svm/exact/client";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import type { ClientEvmSigner } from "@x402/evm";
import type { ClientSvmSigner } from "@x402/svm";
import type { Transaction } from "@solana/transactions";
import type { TransactionModifyingSigner } from "@solana/signers";
import { getBase64EncodedWireTransaction, getTransactionDecoder } from "@solana/transactions";
import { getProvider } from "../provider/index.js";
import { DcpError } from "../provider/dcp-local.js";

export const callTool = {
  name: "1ly_call",
  description:
    "Call a paid API on 1ly.store with automatic x402 payment. Returns the API response and purchase metadata for leaving a review.",
  inputSchema: {
    type: "object" as const,
    properties: {
      endpoint: {
        type: "string",
        description:
          "API endpoint (e.g., 'joe/weather' or '/api/link/joe/weather')",
      },
      method: {
        type: "string",
        enum: ["GET", "POST", "PUT", "DELETE", "PATCH"],
        description: "HTTP method (default: GET)",
      },
      body: {
        type: "object",
        description: "Request body for POST/PUT/PATCH requests",
      },
      headers: {
        type: "object",
        description: "Additional headers to send",
      },
    },
    required: ["endpoint"],
  },
};

const InputSchema = z.object({
  endpoint: z.string(),
  method: z.enum(["GET", "POST", "PUT", "DELETE", "PATCH"]).optional().default("GET"),
  body: z.record(z.unknown()).optional(),
  headers: z.record(z.string()).optional(),
});

function parseEndpoint(endpoint: string): string {
  if (endpoint.startsWith("/api/link/")) {
    return endpoint;
  }
  const cleaned = endpoint.replace(/^\//, "");
  return `/api/link/${cleaned}`;
}

export async function handleCall(args: unknown, config: Config) {
  const input = InputSchema.parse(args);
  const provider = await getProvider();

  const endpointPath = parseEndpoint(input.endpoint);
  const fullUrl = `${config.apiBase}${endpointPath}`;
  const requestHeaders = {
    "Content-Type": "application/json",
    ...input.headers,
  };

  const initialResponse = await fetchWithTimeout(fullUrl, {
    method: input.method,
    headers: requestHeaders,
    body: input.body ? JSON.stringify(input.body) : undefined,
  });

  if (initialResponse.status !== 402) {
    if (initialResponse.ok) {
      const data = await initialResponse.json();
      return mcpOk({ data, _1ly: { note: "No payment required (free API)" } });
    }
    await assertOk(initialResponse, "API call failed");
  }

  // Parse 402 response body for payment requirements
  let body402: {
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
  } = {};
  try {
    body402 = (await initialResponse.json()) as typeof body402;
  } catch {
    // Some 402 responses only include headers
  }

  // Determine preferred network based on provider type and config
  const solanaKey = config.walletSolana || (config.wallet?.type === "solana" ? config.wallet.key : null);
  const evmKey = config.walletEvm || (config.wallet?.type === "evm" ? config.wallet.key : null);

  const preferredNetwork =
    provider.type === "coinbase"
      ? "eip155"
      : solanaKey && !evmKey
      ? "solana"
      : evmKey && !solanaKey
      ? "eip155"
      : config.network === "solana"
      ? "solana"
      : "eip155";

  const accepts = body402.accepts?.find((entry) => {
    const network = String(entry.network);
    if (preferredNetwork === "solana") return network.startsWith("solana:");
    return network.startsWith("eip155:");
  }) || body402.accepts?.[0];

  if (!accepts) {
    throw new McpToolError("402 response missing payment requirements in body", {
      code: "PAYMENT_REQUIREMENTS_MISSING",
    });
  }

  // Parse price
  const rawAmount = accepts.amount || accepts.maxAmountRequired;
  const priceInSmallestUnit = rawAmount ? Number(rawAmount) : NaN;
  if (!Number.isFinite(priceInSmallestUnit) || priceInSmallestUnit <= 0) {
    throw new McpToolError("Invalid or missing payment amount in 402 requirements", {
      code: "INVALID_PAYMENT_AMOUNT",
    });
  }
  const priceUsd = priceInSmallestUnit / 1_000_000;
  const paymentCurrency = accepts.asset || "USDC";

  const network = String(accepts.network || "");
  const shouldUseSolana = network.startsWith("solana:")
    ? true
    : network.startsWith("eip155:")
    ? false
    : preferredNetwork === "solana";

  // Budget check - use provider for DCP, local for others
  if (provider.type === "dcp-local" || provider.type === "dcp-remote") {
    const budgetCheck = await provider.checkBudget(
      priceUsd,
      paymentCurrency,
      shouldUseSolana ? "solana" : "base"
    );
    if (!budgetCheck.allowed) {
      const reason = (budgetCheck.reason || "").toLowerCase();
      const isDaily = reason.includes("daily");
      throw new McpToolError(budgetCheck.reason || "Budget exceeded", {
        code: isDaily ? "BUDGET_EXCEEDED_DAILY" : "BUDGET_EXCEEDED_TX",
        action: isDaily ? "wait_or_increase_daily_limit" : "reduce_amount_or_increase_limit",
      });
    }
  } else {
    // Local budget check for raw/coinbase providers
    if (priceUsd > config.budgets.perCall) {
      throw new McpToolError(
        `Price $${priceUsd} exceeds per-call budget limit of $${config.budgets.perCall}`,
        { code: "PRICE_EXCEEDS_PER_CALL_BUDGET", action: "increase_per_call_budget" }
      );
    }
    checkAndRecordDailySpend(config, priceUsd);
  }

  // === DCP Provider Path ===
  if (provider.type === "dcp-local" || provider.type === "dcp-remote") {
    try {
      const coreClient = new x402Client((_, acceptsList) => {
        return shouldUseSolana
          ? acceptsList.find((entry) => String(entry.network).startsWith("solana:")) || acceptsList[0]
          : acceptsList.find((entry) => String(entry.network).startsWith("eip155:")) || acceptsList[0];
      });

      if (shouldUseSolana) {
        const dcpAddress = await provider.getPublicAddress("solana");
        const txDecoder = getTransactionDecoder();
        const dcpSigner: TransactionModifyingSigner = {
          address: dcpAddress as unknown as TransactionModifyingSigner["address"],
          modifyAndSignTransactions: async <T extends Transaction>(transactions: T[]): Promise<T[]> => {
            const signed: T[] = [];
            for (const tx of transactions) {
              const unsignedBase64 = getBase64EncodedWireTransaction(tx);
              const unsignedBytes = Buffer.from(unsignedBase64, "base64");
              const signedBytes = await provider.signSolanaTransaction(unsignedBytes);
              const signedTx = txDecoder.decode(signedBytes) as T;
              signed.push(signedTx);
            }
            return signed;
          },
        };

        registerExactSvmScheme(coreClient, {
          signer: dcpSigner as unknown as ClientSvmSigner,
          networks: [accepts.network as `${string}:${string}`],
        });
      } else {
        const dcpAddress = await provider.getPublicAddress("evm");
        const safeJsonStringify = (value: unknown) =>
          JSON.stringify(value, (_, v) => (typeof v === "bigint" ? v.toString() : v));
        const dcpSigner: ClientEvmSigner = {
          address: dcpAddress as `0x${string}`,
          signTypedData: async (params) => {
            const signResult = await provider.signX402Payment({
              network: "base",
              paymentPayload: Buffer.from(safeJsonStringify(params), "utf8"),
              amount: String(priceInSmallestUnit),
              currency: paymentCurrency,
              recipient: accepts.payTo,
              purpose: endpointPath,
              typedData: {
                domain: params.domain,
                types: params.types,
                primaryType: params.primaryType,
                message: params.message,
              },
            });
            return signResult.signature as `0x${string}`;
          },
        };

        registerExactEvmScheme(coreClient, {
          signer: dcpSigner,
          networks: [accepts.network as `${string}:${string}`],
        });
      }

      const httpClient = new x402HTTPClient(coreClient);
      let paymentRequired: PaymentRequired;

      try {
        paymentRequired = httpClient.getPaymentRequiredResponse(
          (name) => initialResponse.headers.get(name),
          body402
        ) as PaymentRequired;
      } catch {
        if (body402 && typeof body402 === "object" && "x402Version" in body402) {
          const resource = {
            url: fullUrl,
            description: endpointPath,
            mimeType: "application/json",
          };
          const acceptsList = (body402.accepts || []).map((entry) => ({
            scheme: entry.scheme,
            network: entry.network as `${string}:${string}`,
            amount: entry.amount || entry.maxAmountRequired || "0",
            payTo: entry.payTo,
            asset: entry.asset || "USDC",
            maxTimeoutSeconds: entry.maxTimeoutSeconds ?? 300,
            extra: entry.extra || {},
          }));
          paymentRequired = {
            x402Version: body402.x402Version as number,
            resource,
            accepts: acceptsList,
          };
        } else {
          throw new McpToolError("Invalid payment required response", {
            code: "PAYMENT_REQUIREMENTS_MISSING",
          });
        }
      }

      const paymentPayload = await httpClient.createPaymentPayload(paymentRequired);
      const paymentHeaders = httpClient.encodePaymentSignatureHeader(paymentPayload);
      const paymentSignature =
        paymentHeaders["PAYMENT-SIGNATURE"] ||
        paymentHeaders["Payment-Signature"] ||
        paymentHeaders["payment-signature"] ||
        paymentHeaders["X-PAYMENT"];

      if (!paymentSignature) {
        throw new McpToolError("Failed to build payment signature", { code: "PAYMENT_FAILED" });
      }

      // Make paid request
      const paidResponse = await fetchWithTimeout(fullUrl, {
        method: input.method,
        headers: {
          ...requestHeaders,
          "payment-signature": paymentSignature,
        },
        body: input.body ? JSON.stringify(input.body) : undefined,
      });

      if (!paidResponse.ok) {
        const errorText = await paidResponse.text();
        throw new McpToolError(`Payment failed: ${paidResponse.status} - ${errorText}`, {
          code: "PAYMENT_FAILED",
        });
      }

      const responseData = await paidResponse.json();
      return mcpOk(responseData);
    } catch (error) {
      // Map DcpError to McpToolError
      if (error instanceof DcpError) {
        // Map DCP error codes to MCP error codes
        const dcpCodeMap: Record<string, import("../error-codes.js").McpErrorCode> = {
          DCP_REQUEST_FAILED: "DCP_REQUEST_FAILED",
          CONSENT_REQUIRED: "CONSENT_REQUIRED",
          CONSENT_DENIED: "CONSENT_DENIED",
          CONSENT_TIMEOUT: "CONSENT_TIMEOUT",
          VAULT_LOCKED: "VAULT_OFFLINE",
          BUDGET_EXCEEDED_TX: "BUDGET_EXCEEDED_TX",
          BUDGET_EXCEEDED_DAILY: "BUDGET_EXCEEDED_DAILY",
        };
        throw new McpToolError(error.message, {
          code: dcpCodeMap[error.code] || "UNKNOWN_ERROR",
          meta: error.meta,
        });
      }
      throw error;
    }
  }

  // === Coinbase Provider Path ===
  if (provider.type === "coinbase") {
    if (shouldUseSolana) {
      throw new McpToolError(
        "Agentic Wallet only supports Base (EVM). Solana payments are not supported.",
        { code: "AGENTIC_WALLET_BASE_ONLY", action: "use_evm_or_raw_solana" }
      );
    }

    const baseAccept = {
      scheme: accepts.scheme,
      network: accepts.network,
      amount: accepts.amount,
      maxAmountRequired: accepts.maxAmountRequired,
      payTo: accepts.payTo,
      asset: accepts.asset,
      maxTimeoutSeconds: accepts.maxTimeoutSeconds,
      extra: accepts.extra,
    };

    const result = await makeX402RequestViaAgenticWallet(
      {
        baseURL: config.apiBase,
        path: endpointPath,
        method: input.method,
        body: input.body,
        headers: requestHeaders,
        maxAmountPerRequest: priceInSmallestUnit,
        paymentRequirements: [baseAccept],
      },
      30_000
    );

    if (result.status < 200 || result.status >= 300) {
      throw new McpToolError(
        `Payment failed: ${result.status} - ${result.statusText || "Agentic Wallet error"}`,
        { code: "PAYMENT_FAILED" }
      );
    }

    return mcpOk(result.data ?? {});
  }

  // === Raw Provider Path ===
  if (!solanaKey && !evmKey) {
    throw new McpToolError(
      "Missing wallet config: set ONELY_WALLET_SOLANA_KEY or ONELY_WALLET_EVM_KEY",
      { code: "MISSING_WALLET_CONFIG", action: "set_wallet_env" }
    );
  }

  if (shouldUseSolana && !solanaKey) {
    throw new McpToolError("Solana wallet not configured for this payment", {
      code: "MISSING_WALLET_CONFIG",
      action: "set_wallet_env",
    });
  }
  if (!shouldUseSolana && !evmKey) {
    throw new McpToolError("EVM wallet not configured for this payment", {
      code: "MISSING_WALLET_CONFIG",
      action: "set_wallet_env",
    });
  }

  // Build x402 payment signature using existing wallet code
  let paymentSignature: string;

  if (shouldUseSolana) {
    const wallet = await loadSolanaWallet(solanaKey!);
    const coreClient = new x402Client((_, acceptsList) => {
      return (
        acceptsList.find((entry) => String(entry.network).startsWith("solana:")) ||
        acceptsList[0]
      );
    });
    const httpClient = new x402HTTPClient(coreClient);
    const paymentRequired = httpClient.getPaymentRequiredResponse(
      (name) => initialResponse.headers.get(name),
      body402
    );
    paymentSignature = await buildSolanaPaymentSignature(paymentRequired, wallet);
  } else {
    const coreClient = new x402Client((_, acceptsList) => {
      return (
        acceptsList.find((entry) => String(entry.network).startsWith("eip155:")) ||
        acceptsList[0]
      );
    });
    const httpClient = new x402HTTPClient(coreClient);
    const paymentRequired = httpClient.getPaymentRequiredResponse(
      (name) => initialResponse.headers.get(name),
      body402
    );
    paymentSignature = await buildEvmPaymentSignature(paymentRequired, evmKey!);
  }

  const paidResponse = await fetchWithTimeout(fullUrl, {
    method: input.method,
    headers: {
      ...requestHeaders,
      "payment-signature": paymentSignature,
    },
    body: input.body ? JSON.stringify(input.body) : undefined,
  });

  if (!paidResponse.ok) {
    const errorText = await paidResponse.text();
    throw new McpToolError(`Payment failed: ${paidResponse.status} - ${errorText}`, {
      code: "PAYMENT_FAILED",
    });
  }

  const responseData = await paidResponse.json();
  return mcpOk(responseData);
}
