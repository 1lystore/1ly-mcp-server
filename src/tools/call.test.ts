import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { encodePaymentRequiredHeader } from "@x402/core/http";
import type { Config } from "../config.js";

// Mock wallet/payment builders so tests don't require real keys/crypto
vi.mock("../wallet/solana.js", async () => {
  return {
    loadSolanaWallet: vi.fn(async () => ({ publicKey: { toBase58: () => "TEST" }, secretKey: new Uint8Array(64) })),
    buildSolanaPayment: vi.fn(async () => "PAYMENT_HEADER"),
    buildSolanaPaymentSignature: vi.fn(async () => "PAYMENT_SIGNATURE"),
  };
});

vi.mock("../wallet/evm.js", async () => {
  return {
    loadEvmWallet: vi.fn(async () => ({ address: "0x0000000000000000000000000000000000000000" })),
    buildEvmPayment: vi.fn(async () => "EVM_PAYMENT_HEADER"),
    buildEvmPaymentSignature: vi.fn(async () => "EVM_PAYMENT_SIGNATURE"),
    getEvmWalletAddress: vi.fn(async () => "0x0000000000000000000000000000000000000000"),
  };
});

vi.mock("../wallet/agentic.js", async () => {
  return {
    makeX402RequestViaAgenticWallet: vi.fn(async () => ({
      status: 200,
      statusText: "OK",
      data: { data: { ok: true }, _1ly: { purchaseId: "p1" } },
      headers: {},
    })),
  };
});

// Mock provider module for tests
const mockRawProvider = {
  type: "raw" as const,
  isAvailable: vi.fn(async () => true),
  getPublicAddress: vi.fn(async (chain: string) =>
    chain === "solana" ? "TEST" : "0x0000000000000000000000000000000000000000"
  ),
  checkBudget: vi.fn(async () => ({ allowed: true, remaining: 100, currency: "USD" })),
  signMessage: vi.fn(async () => "SIGNATURE"),
  signX402Payment: vi.fn(async () => ({ signature: "PAYMENT_SIGNATURE", publicKey: "TEST" })),
  signSolanaTransaction: vi.fn(async () => new Uint8Array(64)),
  signSolanaPayload: vi.fn(async () => new Uint8Array(64)),
  signEvmTypedData: vi.fn(async () => "0xSIGNATURE"),
  readCredential: vi.fn(async () => null),
  writeCredential: vi.fn(async () => {}),
  readData: vi.fn(async () => null),
};

const mockCoinbaseProvider = {
  type: "coinbase" as const,
  isAvailable: vi.fn(async () => true),
  getPublicAddress: vi.fn(async () => "0x0000000000000000000000000000000000000000"),
  checkBudget: vi.fn(async () => ({ allowed: true, remaining: 100, currency: "USD" })),
  signMessage: vi.fn(async () => { throw new Error("Not supported"); }),
  signX402Payment: vi.fn(async () => ({ signature: "PAYMENT_SIGNATURE", publicKey: "0x0000000000000000000000000000000000000000" })),
  signSolanaTransaction: vi.fn(async () => { throw new Error("Not supported"); }),
  signSolanaPayload: vi.fn(async () => { throw new Error("Not supported"); }),
  signEvmTypedData: vi.fn(async () => { throw new Error("Not supported"); }),
  readCredential: vi.fn(async () => null),
  writeCredential: vi.fn(async () => {}),
  readData: vi.fn(async () => null),
};

let currentMockProvider = mockRawProvider;

vi.mock("../provider/index.js", async () => {
  return {
    getProvider: vi.fn(async () => currentMockProvider),
    resetProvider: vi.fn(),
  };
});

import { handleCall } from "./call.js";
import { makeX402RequestViaAgenticWallet } from "../wallet/agentic.js";

const config: Config = {
  apiBase: "https://1ly.store",
  wallet: { type: "solana", key: "/dev/null" },
  walletSolana: "/dev/null",
  budgets: { perCall: 10, daily: 100 },
  network: "solana",
  walletProvider: "raw",
  solanaRpcUrl: "https://api.mainnet-beta.solana.com",
};

describe("1ly_call", () => {
  beforeEach(() => {
    // Ensure budget state doesn't leak across tests
    process.env.ONELY_BUDGET_STATE_FILE = `/tmp/1ly-mcp-budget-test-${Date.now()}.json`;
    // Reset mock provider to raw for most tests
    currentMockProvider = mockRawProvider;
    vi.clearAllMocks();
  });

  afterEach(() => {
    currentMockProvider = mockRawProvider;
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

  it("uses agentic wallet IPC when coinbase provider is set", async () => {
    // Use coinbase mock provider
    currentMockProvider = mockCoinbaseProvider;

    const coinbaseConfig: Config = {
      apiBase: "https://1ly.store",
      wallet: null,
      budgets: { perCall: 10, daily: 100 },
      network: "base",
      walletProvider: "coinbase",
      solanaRpcUrl: "https://api.mainnet-beta.solana.com",
    };

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
          network: "eip155:8453",
          amount: "10000",
          payTo: "TREASURY",
          asset: "USDC",
        },
      ],
    };

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(paymentRequired), {
          status: 402,
          headers: {
            "PAYMENT-REQUIRED": encodePaymentRequiredHeader(paymentRequired),
          },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, _1ly: { purchaseId: "p1" } }), {
          status: 200,
        })
      );

    globalThis.fetch = fetchMock;

    const res = await handleCall({ endpoint: "joe/weather", method: "GET" }, coinbaseConfig);
    const text = (res.content[0] as { text: string }).text;
    const parsed = JSON.parse(text) as { ok: boolean };

    expect(parsed.ok).toBe(true);
    expect(makeX402RequestViaAgenticWallet).toHaveBeenCalledTimes(1);
    // Agentic wallet path should not use local signing; only initial 402 fetch should occur.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws clear error when coinbase provider receives solana-only requirements", async () => {
    // Use coinbase mock provider
    currentMockProvider = mockCoinbaseProvider;

    const coinbaseConfig: Config = {
      apiBase: "https://1ly.store",
      wallet: null,
      budgets: { perCall: 10, daily: 100 },
      network: "base",
      walletProvider: "coinbase",
      solanaRpcUrl: "https://api.mainnet-beta.solana.com",
    };

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
        },
      ],
    };

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(paymentRequired), {
          status: 402,
          headers: {
            "PAYMENT-REQUIRED": encodePaymentRequiredHeader(paymentRequired),
          },
        })
      );

    globalThis.fetch = fetchMock;

    await expect(handleCall({ endpoint: "joe/weather", method: "GET" }, coinbaseConfig)).rejects.toThrow(
      /Agentic Wallet only supports Base/
    );
  });
});
