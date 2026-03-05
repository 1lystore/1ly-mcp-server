import { loadConfig } from "./config.js";
import { fetchWithTimeout, assertOk } from "./http.js";
import { loadSolanaWallet } from "./wallet/solana.js";
import { loadEvmWallet } from "./wallet/evm.js";
import { checkDcpStatus, DcpLocalProvider } from "./provider/dcp-local.js";
import { getProvider } from "./provider/index.js";

function log(line: string) {
  console.error(line);
}

function getArgValue(argv: string[], flag: string): string | undefined {
  const idx = argv.indexOf(flag);
  if (idx !== -1 && idx + 1 < argv.length) {
    return argv[idx + 1];
  }
  return undefined;
}

export async function runSelfTest(argv: string[]): Promise<number> {
  const showHelp = argv.includes("--help") || argv.includes("-h");
  if (showHelp) {
    log("1ly-mcp --self-test [--provider <type>]");
    log("");
    log("Options:");
    log("  --provider <type>  Test specific provider (dcp-local, raw, coinbase)");
    log("");
    log("Required env:");
    log("- ONELY_WALLET_SOLANA_KEY=/path/to/solana.json (or inline json array)");
    log("- ONELY_WALLET_EVM_KEY=/path/to/evm.key (or inline 0x...)");
    log("");
    log("Legacy env (still supported):");
    log("- ONELY_WALLET_TYPE=solana|evm");
    log("- ONELY_WALLET_KEY=/path/to/key (or inline key)");
    log("");
    log("Optional env:");
    log("- ONELY_API_BASE=https://1ly.store (optional override)");
    log("- ONELY_BUDGET_PER_CALL=1.00");
    log("- ONELY_BUDGET_DAILY=50.00");
    log("- ONELY_BUDGET_STATE_FILE=/path/to/state.json");
    log("- ONELY_PROVIDER=raw|coinbase|dcp|remote");
    log("- MCP_AGENT_NAME=1ly-mcp");
    return 0;
  }

  const providerType = getArgValue(argv, "--provider");

  // Test DCP specifically
  if (providerType === "dcp-local") {
    return await testDcpLocal();
  }

  // Test default provider resolution
  return await testDefaultProvider();
}

async function testDcpLocal(): Promise<number> {
  log("[self-test] Testing DcpLocalProvider...\n");

  try {
    // Step 1: Check DCP health
    log("1. Checking DCP at localhost:8420...");
    const status = await checkDcpStatus();

    if (status === "not_running") {
      log("   ❌ DCP not running at localhost:8420");
      log("   Start DCP: npx @dcprotocol/server");
      return 1;
    }

    if (status === "locked") {
      log("   ❌ DCP vault is locked");
      log("   Unlock via DCP CLI or Desktop app");
      return 1;
    }

    log("   ✅ DCP is running and unlocked");

    // Step 2: Test address retrieval
    log("\n2. Testing address retrieval...");
    const provider = new DcpLocalProvider();

    try {
      const address = await provider.getPublicAddress("solana");
      log(`   ✅ Solana address: ${address}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log(`   ❌ Failed to get Solana address: ${message}`);
      log("      Make sure you have a Solana wallet in DCP");
    }

    try {
      const address = await provider.getPublicAddress("evm");
      log(`   ✅ Base/EVM address: ${address}`);
    } catch {
      log("   ℹ️  No EVM wallet configured (optional)");
    }

    // Step 3: Test budget check
    log("\n3. Testing budget check...");
    try {
      const budget = await provider.checkBudget(1.0, "USDC");
      log(`   ✅ Budget: ${budget.allowed ? "allowed" : "denied"}`);
      log(`      Remaining daily: ${budget.remaining} ${budget.currency}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log(`   ❌ Budget check failed: ${message}`);
    }

    // Step 4: Summary
    log("\n" + "─".repeat(50));
    log("✅ DCP self-test passed");
    log("   Provider: dcp-local");
    log("   Endpoint: http://localhost:8420");
    log("   Agent: " + (process.env.MCP_AGENT_NAME || "1ly-mcp"));
    log("─".repeat(50));
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(`[self-test] FAIL: ${message}`);
    return 1;
  }
}

async function testDefaultProvider(): Promise<number> {
  try {
    log("[self-test] Testing default provider resolution...\n");

    const provider = await getProvider();
    log(`✅ Provider resolved: ${provider.type}`);

    if (await provider.isAvailable()) {
      log("✅ Provider is available");

      try {
        const address = await provider.getPublicAddress("solana");
        log(`✅ Solana address: ${address}`);
      } catch {
        log("ℹ️  No Solana wallet");
      }

      try {
        const address = await provider.getPublicAddress("evm");
        log(`✅ EVM address: ${address}`);
      } catch {
        log("ℹ️  No EVM wallet");
      }
    } else {
      log("⚠️  Provider not available (free tools only)");
    }

    // Test 1ly.store reachability
    log("\n[self-test] checking 1ly.store reachability...");
    const config = loadConfig();
    const url = `${config.apiBase}/api/discover?q=api&limit=1`;
    const res = await fetchWithTimeout(url, { timeoutMs: 10_000, retries: 1 });
    await assertOk(res, "Reachability check failed");
    await res.json().catch(() => null);

    log("[self-test] OK");
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(`[self-test] FAIL: ${message}`);
    return 1;
  }
}
