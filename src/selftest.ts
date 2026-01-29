import { loadConfig } from "./config.js";
import { fetchWithTimeout, assertOk } from "./http.js";
import { loadSolanaWallet } from "./wallet/solana.js";
import { loadEvmWallet } from "./wallet/evm.js";

function log(line: string) {
  console.error(line);
}

export async function runSelfTest(argv: string[]): Promise<number> {
  const showHelp = argv.includes("--help") || argv.includes("-h");
  if (showHelp) {
    log("1ly-mcp --self-test");
    log("");
    log("Required env:");
    log("- ONELY_WALLET_TYPE=solana|evm");
    log("- ONELY_WALLET_KEY=/path/to/key (or inline key)");
    log("");
    log("Optional env:");
    log("- ONELY_API_BASE is not configurable (always https://1ly.store)");
    log("- ONELY_BUDGET_PER_CALL=1.00");
    log("- ONELY_BUDGET_DAILY=50.00");
    log("- ONELY_BUDGET_STATE_FILE=/path/to/state.json");
    return 0;
  }

  try {
    log("[self-test] loading config");
    const config = loadConfig();
    log(`[self-test] apiBase=${config.apiBase}`);
    if (!config.wallet) {
      throw new Error("Missing wallet config: set ONELY_WALLET_TYPE and ONELY_WALLET_KEY");
    }
    log(`[self-test] walletType=${config.wallet.type}`);

    log("[self-test] loading wallet");
    if (config.wallet.type === "solana") {
      const kp = await loadSolanaWallet(config.wallet.key);
      log(`[self-test] solana pubkey=${kp.publicKey.toBase58()}`);
    } else {
      const account = await loadEvmWallet(config.wallet.key);
      log(`[self-test] evm address=${account.address}`);
    }

    log("[self-test] checking 1ly.store reachability");
    const url = `${config.apiBase}/api/discover?q=api&limit=1`;
    const res = await fetchWithTimeout(url, { timeoutMs: 10_000, retries: 1 });
    await assertOk(res, "Reachability check failed");
    await res.json().catch(() => null);
    log("[self-test] OK");
    return 0;
  } catch (e) {
    log(`[self-test] FAIL: ${e instanceof Error ? e.message : String(e)}`);
    return 1;
  }
}
