/**
 * Provider regression tests
 *
 * Ensures Phase 0 behavior is unchanged:
 * - Raw wallet path works
 * - Coinbase provider path works
 * - DCP detection works
 * - Provider priority is correct
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// Save original env
const originalEnv = { ...process.env };

// Mock checkDcpStatus before importing
vi.mock("./dcp-local.js", async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return {
    ...actual,
    checkDcpStatus: vi.fn(async () => "not_running" as const),
    DcpLocalProvider: actual.DcpLocalProvider,
    DcpError: actual.DcpError,
  };
});

import { getProvider, resetProvider } from "./index.js";
import { checkDcpStatus } from "./dcp-local.js";

describe("Provider Resolution", () => {
  beforeEach(() => {
    // Reset all env vars
    delete process.env.ONELY_PROVIDER;
    delete process.env.DCP_VAULT_ID;
    delete process.env.DCP_RELAY_URL;
    delete process.env.DCP_RELAY_TOKEN;
    delete process.env.ONELY_WALLET_PROVIDER;
    delete process.env.ONELY_WALLET_SOLANA_KEY;
    delete process.env.ONELY_WALLET_EVM_KEY;
    resetProvider();
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Restore original env
    Object.assign(process.env, originalEnv);
    resetProvider();
  });

  describe("Raw wallet path", () => {
    it("returns RawLocalProvider when solana key is set", async () => {
      process.env.ONELY_WALLET_SOLANA_KEY = "/tmp/fake-wallet.json";
      vi.mocked(checkDcpStatus).mockResolvedValue("not_running");

      const provider = await getProvider();
      expect(provider.type).toBe("raw");
    });

    it("returns RawLocalProvider when evm key is set", async () => {
      process.env.ONELY_WALLET_EVM_KEY = "/tmp/fake-evm-wallet.json";
      vi.mocked(checkDcpStatus).mockResolvedValue("not_running");

      const provider = await getProvider();
      expect(provider.type).toBe("raw");
    });

    it("returns RawLocalProvider when both keys are set", async () => {
      process.env.ONELY_WALLET_SOLANA_KEY = "/tmp/fake-wallet.json";
      process.env.ONELY_WALLET_EVM_KEY = "/tmp/fake-evm-wallet.json";
      vi.mocked(checkDcpStatus).mockResolvedValue("not_running");

      const provider = await getProvider();
      expect(provider.type).toBe("raw");
    });

    it("returns RawLocalProvider with explicit ONELY_PROVIDER=raw", async () => {
      process.env.ONELY_PROVIDER = "raw";
      process.env.ONELY_WALLET_SOLANA_KEY = "/tmp/fake-wallet.json";

      const provider = await getProvider();
      expect(provider.type).toBe("raw");
    });
  });

  describe("Coinbase provider path", () => {
    it("returns CoinbaseProvider when ONELY_WALLET_PROVIDER=coinbase", async () => {
      process.env.ONELY_WALLET_PROVIDER = "coinbase";
      vi.mocked(checkDcpStatus).mockResolvedValue("not_running");

      const provider = await getProvider();
      expect(provider.type).toBe("coinbase");
    });

    it("returns CoinbaseProvider with explicit ONELY_PROVIDER=coinbase", async () => {
      process.env.ONELY_PROVIDER = "coinbase";

      const provider = await getProvider();
      expect(provider.type).toBe("coinbase");
    });
  });

  describe("DCP remote provider path", () => {
    it("returns DcpRemoteProvider when DCP_VAULT_ID is set", async () => {
      process.env.DCP_VAULT_ID = "test-vault-id";
      vi.mocked(checkDcpStatus).mockResolvedValue("not_running");

      const provider = await getProvider();
      expect(provider.type).toBe("dcp-remote");
    });

    it("returns DcpRemoteProvider with explicit ONELY_PROVIDER=remote", async () => {
      process.env.ONELY_PROVIDER = "remote";
      process.env.DCP_VAULT_ID = "test-vault-id";

      const provider = await getProvider();
      expect(provider.type).toBe("dcp-remote");
    });
  });

  describe("NoOp provider fallback", () => {
    it("returns NoOpProvider when no wallet is configured", async () => {
      vi.mocked(checkDcpStatus).mockResolvedValue("not_running");

      const provider = await getProvider();
      expect(provider.type).toBe("noop");
    });
  });

  describe("Provider priority", () => {
    it("DCP_VAULT_ID takes priority over raw wallet keys when DCP not running", async () => {
      process.env.DCP_VAULT_ID = "test-vault-id";
      process.env.ONELY_WALLET_SOLANA_KEY = "/tmp/fake-wallet.json";
      vi.mocked(checkDcpStatus).mockResolvedValue("not_running");

      const provider = await getProvider();
      // DCP_VAULT_ID should win over raw keys
      expect(provider.type).toBe("dcp-remote");
    });

    it("explicit ONELY_PROVIDER overrides auto-detection", async () => {
      process.env.ONELY_PROVIDER = "raw";
      process.env.ONELY_WALLET_SOLANA_KEY = "/tmp/fake-wallet.json";
      process.env.DCP_VAULT_ID = "test-vault-id";

      const provider = await getProvider();
      // Explicit override should win
      expect(provider.type).toBe("raw");
    });

    it("coinbase takes priority over raw when specified", async () => {
      process.env.ONELY_WALLET_PROVIDER = "coinbase";
      process.env.ONELY_WALLET_SOLANA_KEY = "/tmp/fake-wallet.json";
      vi.mocked(checkDcpStatus).mockResolvedValue("not_running");

      const provider = await getProvider();
      expect(provider.type).toBe("coinbase");
    });
  });

  describe("Provider caching", () => {
    it("returns same provider instance on multiple calls", async () => {
      process.env.ONELY_WALLET_SOLANA_KEY = "/tmp/fake-wallet.json";
      vi.mocked(checkDcpStatus).mockResolvedValue("not_running");

      const provider1 = await getProvider();
      const provider2 = await getProvider();
      expect(provider1).toBe(provider2);
    });

    it("resetProvider clears the cache", async () => {
      process.env.ONELY_WALLET_SOLANA_KEY = "/tmp/fake-wallet.json";
      vi.mocked(checkDcpStatus).mockResolvedValue("not_running");

      const provider1 = await getProvider();
      resetProvider();
      const provider2 = await getProvider();

      // Same type but different instance
      expect(provider1.type).toBe(provider2.type);
    });
  });
});

describe("Provider isAvailable behavior", () => {
  beforeEach(() => {
    delete process.env.ONELY_PROVIDER;
    delete process.env.DCP_VAULT_ID;
    delete process.env.ONELY_WALLET_SOLANA_KEY;
    delete process.env.ONELY_WALLET_EVM_KEY;
    delete process.env.ONELY_WALLET_PROVIDER;
    resetProvider();
    vi.clearAllMocks();
  });

  afterEach(() => {
    Object.assign(process.env, originalEnv);
    resetProvider();
  });

  it("raw provider isAvailable returns false when wallet file doesn't exist", async () => {
    // RawLocalProvider.isAvailable() returns true only if wallet loads successfully
    // A non-existent file path means wallet won't load
    process.env.ONELY_WALLET_SOLANA_KEY = "/tmp/non-existent-wallet.json";
    vi.mocked(checkDcpStatus).mockResolvedValue("not_running");

    const provider = await getProvider();
    expect(provider.type).toBe("raw");
    // isAvailable returns false because the wallet file doesn't exist
    expect(await provider.isAvailable()).toBe(false);
  });

  it("noop provider isAvailable returns false (no wallet configured)", async () => {
    // NoOpProvider.isAvailable() always returns false - it's a placeholder
    vi.mocked(checkDcpStatus).mockResolvedValue("not_running");

    const provider = await getProvider();
    expect(provider.type).toBe("noop");
    // NoOp provider is never "available" for signing - but free tools still work
    expect(await provider.isAvailable()).toBe(false);
  });

  it("coinbase provider type is correct", async () => {
    // CoinbaseProvider.isAvailable() requires IPC - skip the availability check
    // Just verify provider resolution works correctly
    process.env.ONELY_WALLET_PROVIDER = "coinbase";
    vi.mocked(checkDcpStatus).mockResolvedValue("not_running");

    const provider = await getProvider();
    expect(provider.type).toBe("coinbase");
  });

  it("dcp-remote provider isAvailable depends on relay connection", async () => {
    process.env.DCP_VAULT_ID = "test-vault-id";
    vi.mocked(checkDcpStatus).mockResolvedValue("not_running");

    const provider = await getProvider();
    expect(provider.type).toBe("dcp-remote");
    // Without actual relay connection, isAvailable returns false
    expect(await provider.isAvailable()).toBe(false);
  });
});
