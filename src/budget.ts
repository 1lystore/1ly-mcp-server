import fs from "fs";
import os from "os";
import path from "path";
import type { Config } from "./config.js";

interface BudgetState {
  /** ISO date string (YYYY-MM-DD) */
  date: string;
  /** Total USD spent so far today */
  spentToday: number;
}

function getBudgetStatePath(): string {
  const envPath = process.env.ONELY_BUDGET_STATE_FILE;
  if (envPath && envPath.trim().length > 0) {
    return envPath;
  }
  return path.join(os.homedir(), ".1ly-mcp-budget.json");
}

function loadBudgetState(): BudgetState {
  const filePath = getBudgetStatePath();

  try {
    if (!fs.existsSync(filePath)) {
      return { date: new Date().toISOString().slice(0, 10), spentToday: 0 };
    }

    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw) as BudgetState;
    const today = new Date().toISOString().slice(0, 10);

    // Reset if date changed or data invalid
    if (!parsed.date || typeof parsed.spentToday !== "number" || parsed.date !== today) {
      return { date: today, spentToday: 0 };
    }

    return parsed;
  } catch {
    // On any error, fall back to fresh state
    return { date: new Date().toISOString().slice(0, 10), spentToday: 0 };
  }
}

function saveBudgetState(state: BudgetState): void {
  const filePath = getBudgetStatePath();

  try {
    fs.writeFileSync(filePath, JSON.stringify(state, null, 2), { encoding: "utf-8" });
  } catch {
    // If we cannot persist, we still allow the call; fail-open is safer for UX
  }
}

/**
 * Enforces daily budget by reading/modifying a small JSON file on disk.
 * Throws if this call would exceed the configured daily limit.
 */
export function checkAndRecordDailySpend(config: Config, priceUsd: number): void {
  const today = new Date().toISOString().slice(0, 10);
  const state = loadBudgetState();

  const current = state.date === today ? state.spentToday : 0;
  const next = current + priceUsd;

  if (next > config.budgets.daily) {
    throw new Error(
      `Price $${priceUsd.toFixed(
        4
      )} would exceed daily budget of $${config.budgets.daily} (already spent: $${current.toFixed(
        4
      )})`
    );
  }

  const updated: BudgetState = {
    date: today,
    spentToday: next,
  };

  saveBudgetState(updated);
}

