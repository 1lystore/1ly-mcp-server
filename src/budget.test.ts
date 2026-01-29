import { describe, expect, it, beforeEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import type { Config } from "./config.js";
import { checkAndRecordDailySpend } from "./budget.js";

function mkConfig(daily: number): Config {
  return {
    apiBase: "https://1ly.store",
    wallet: { type: "solana", key: "/dev/null" },
    budgets: { perCall: 10, daily },
    network: "solana",
  };
}

describe("budget", () => {
  let stateFile: string;

  beforeEach(() => {
    stateFile = path.join(os.tmpdir(), `1ly-mcp-budget-test-${Date.now()}.json`);
    process.env.ONELY_BUDGET_STATE_FILE = stateFile;
    try {
      fs.unlinkSync(stateFile);
    } catch {
      // ignore
    }
  });

  it("records spend and enforces daily limit", () => {
    const config = mkConfig(1.0);

    checkAndRecordDailySpend(config, 0.4);
    checkAndRecordDailySpend(config, 0.5);

    expect(() => checkAndRecordDailySpend(config, 0.2)).toThrow(/daily budget/i);
  });
});

