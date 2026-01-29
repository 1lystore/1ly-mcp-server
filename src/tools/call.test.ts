import { describe, expect, it, vi, beforeEach } from "vitest";
import { encodePaymentRequiredHeader } from "@x402/core/http";
import type { Config } from "../config.js";

// Mock wallet/payment builders so tests don't require real keys/crypto
vi.mock("../wallet/solana.js", async () => {
  return {
    loadSolanaWallet: vi.fn(async () => ({ publicKey: { toBase58: () => "TEST" } })),
    buildSolanaPayment: vi.fn(async () => "PAYMENT_HEADER"),
    buildSolanaPaymentSignature: vi.fn(async () => "PAYMENT_SIGNATURE"),
  };
});

vi.mock("../wallet/evm.js", async () => {
  return {
    loadEvmWallet: vi.fn(async () => ({ address: "0x0000000000000000000000000000000000000000" })),
    buildEvmPayment: vi.fn(async () => "EVM_PAYMENT_HEADER"),
    getEvmWalletAddress: vi.fn(async () => "0x0000000000000000000000000000000000000000"),
  };
});

import { handleCall } from "./call.js";

const config: Config = {
  apiBase: "https://1ly.store",
  wallet: { type: "solana", key: "/dev/null" },
  budgets: { perCall: 10, daily: 100 },
  network: "solana",
};

describe("1ly_call", () => {
  beforeEach(() => {
    // Ensure budget state doesn't leak across tests
    process.env.ONELY_BUDGET_STATE_FILE = `/tmp/1ly-mcp-budget-test-${Date.now()}.json`;
  });

  it("handles 402 -> pays -> returns ok response", async () => {
    const paymentRequired = {
      x402Version: 2,
      resource: {
        url: "https://1ly.store/api/link/joe/weather",
        description: "Test API",
        mimeType: "application/json",
      },
      accepts: [
        {
          scheme: "exact",
          network: "solana:devnet",
          amount: "10000",
          payTo: "TREASURY",
          asset: "USDC",
          extra: { feePayer: "FEEPAYER" },
        },
      ],
    };

    const fetchMock = vi
      .fn()
      // First call returns 402 with payment requirements in JSON
      .mockResolvedValueOnce(
        new Response(JSON.stringify(paymentRequired), {
          status: 402,
          headers: {
            "PAYMENT-REQUIRED": encodePaymentRequiredHeader(paymentRequired),
          },
        })
      )
      // Second call returns 200 with data (including _1ly metadata)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ hello: "world", _1ly: { purchaseId: "p1" } }), {
          status: 200,
        })
      );

    globalThis.fetch = fetchMock;

    const res = await handleCall({ endpoint: "joe/weather", method: "GET" }, config);
    const text = (res.content[0] as { text: string }).text;
    const parsed = JSON.parse(text) as { ok: boolean; data: any };

    expect(parsed.ok).toBe(true);
    expect(parsed.data.hello).toBe("world");

    // Ensure we tried twice and sent payment-signature on second attempt
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondCallArgs = fetchMock.mock.calls[1];
    const secondInit = secondCallArgs[1] as { headers?: Record<string, string> };
    expect(secondInit.headers?.["payment-signature"]).toBe("PAYMENT_SIGNATURE");
  });
});
