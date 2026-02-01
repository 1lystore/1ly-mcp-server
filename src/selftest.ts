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
    return 0;
  }

  try {
    log("[self-test] loading config");
    const config = loadConfig();
    log(`[self-test] apiBase=${config.apiBase}`);
    const solanaKey = config.walletSolana || (config.wallet?.type === "solana" ? config.wallet.key : null);
    const evmKey = config.walletEvm || (config.wallet?.type === "evm" ? config.wallet.key : null);
    if (!solanaKey && !evmKey) {
      throw new Error("Missing wallet config: set ONELY_WALLET_SOLANA_KEY or ONELY_WALLET_EVM_KEY");
    }

    log("[self-test] loading wallets");
    if (solanaKey) {
      const kp = await loadSolanaWallet(solanaKey);
      log(`[self-test] solana pubkey=${kp.publicKey.toBase58()}`);
    }
    if (evmKey) {
      const account = await loadEvmWallet(evmKey);
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
