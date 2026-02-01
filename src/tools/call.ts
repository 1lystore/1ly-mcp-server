import { z } from "zod";
import type { Config } from "../config.js";
import { buildSolanaPaymentSignature, loadSolanaWallet } from "../wallet/solana.js";
import { buildEvmPaymentSignature } from "../wallet/evm.js";
import { fetchWithTimeout, assertOk } from "../http.js";
import { checkAndRecordDailySpend } from "../budget.js";
import { mcpOk } from "../mcp.js";
import { x402Client } from "@x402/core/client";
import { x402HTTPClient } from "@x402/core/http";

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
  const solanaKey = config.walletSolana || (config.wallet?.type === "solana" ? config.wallet.key : null);
  const evmKey = config.walletEvm || (config.wallet?.type === "evm" ? config.wallet.key : null);
  if (!solanaKey && !evmKey) {
    throw new Error(
      "Missing wallet config: set ONELY_WALLET_SOLANA_KEY or ONELY_WALLET_EVM_KEY (or legacy ONELY_WALLET_TYPE/KEY)"
    );
  }
  const endpointPath = parseEndpoint(input.endpoint);
  const fullUrl = `${config.apiBase}${endpointPath}`;

  const initialResponse = await fetchWithTimeout(fullUrl, {
    method: input.method,
    headers: {
      "Content-Type": "application/json",
      ...input.headers,
    },
    body: input.body ? JSON.stringify(input.body) : undefined,
  });

  if (initialResponse.status !== 402) {
    if (initialResponse.ok) {
      const data = await initialResponse.json();
      return mcpOk({ data, _1ly: { note: "No payment required (free API)" } });
    }

    // Non-402 failure
    await assertOk(initialResponse, "API call failed");
  }

  // Parse 402 response body for payment requirements (best-effort; may be empty/non-JSON)
  let body402: {
    x402Version?: number;
    accepts?: Array<{
      scheme: string;
      network: string;
      amount?: string;
      maxAmountRequired?: string;
      payTo: string;
      asset?: string;
      extra?: { feePayer?: string };
    }>;
  } = {};
  try {
    body402 = (await initialResponse.json()) as typeof body402;
  } catch {
    // Some 402 responses only include headers
  }

  const preferredNetwork =
    solanaKey && !evmKey
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
    throw new Error("402 response missing payment requirements in body");
  }

  // Price is in smallest unit (e.g., 10000 = 0.01 USDC with 6 decimals)
  const rawAmount = accepts.amount || accepts.maxAmountRequired;
  const priceInSmallestUnit = rawAmount ? Number(rawAmount) : NaN;
  if (!Number.isFinite(priceInSmallestUnit) || priceInSmallestUnit <= 0) {
    throw new Error("Invalid or missing payment amount in 402 requirements");
  }
  const priceUsd = priceInSmallestUnit / 1_000_000;

  if (priceUsd > config.budgets.perCall) {
    throw new Error(
      `Price $${priceUsd} exceeds per-call budget limit of $${config.budgets.perCall}`
    );
  }

  // Enforce and record daily spending
  checkAndRecordDailySpend(config, priceUsd);

  // Build x402 payment signature header (v2)
  let paymentSignature: string;
  const network = String(accepts.network || "");
  const shouldUseSolana = network.startsWith("solana:")
    ? true
    : network.startsWith("eip155:")
    ? false
    : preferredNetwork === "solana";

  if (shouldUseSolana) {
    if (!solanaKey) {
      throw new Error("Solana wallet not configured for this payment");
    }
    const wallet = await loadSolanaWallet(solanaKey);
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
    if (!evmKey) {
      throw new Error("EVM wallet not configured for this payment");
    }
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
    paymentSignature = await buildEvmPaymentSignature(paymentRequired, evmKey);
  }

  const paidResponse = await fetchWithTimeout(fullUrl, {
    method: input.method,
    headers: {
      "Content-Type": "application/json",
      ...input.headers,
      "payment-signature": paymentSignature,
    },
    body: input.body ? JSON.stringify(input.body) : undefined,
  });

  if (!paidResponse.ok) {
    const errorText = await paidResponse.text();
    throw new Error(`Payment failed: ${paidResponse.status} - ${errorText}`);
  }

  const responseData = await paidResponse.json();

  return mcpOk(responseData);
}
