import { z } from "zod";
import { loadStoredApiKey } from "./keys.js";
import { logSecurityEvent } from "./security-log.js";

export const ConfigSchema = z.object({
  apiBase: z
    .string()
    .url()
    .refine(
      (url) => {
        try {
          const parsed = new URL(url);

          // Allow 1ly.store with HTTPS only
          if (parsed.hostname === "1ly.store" || parsed.hostname === "www.1ly.store") {
            return parsed.protocol === "https:";
          }

          // Allow localhost for local development (any port)
          if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
            return true;
          }

          // Block everything else
          return false;
        } catch {
          return false;
        }
      },
      {
        message:
          "API base must be https://1ly.store or http://localhost:PORT for local development",
      }
    )
    .default("https://1ly.store"),
  wallet: z
    .object({
      type: z.enum(["solana", "evm"]),
      key: z.string(),
    })
    .optional()
    .nullable(),
  walletSolana: z.string().optional().nullable(),
  walletEvm: z.string().optional().nullable(),
  budgets: z.object({
    perCall: z.number().positive().finite().default(1.0),
    daily: z.number().positive().finite().default(50.0),
  }),
  network: z.enum(["solana", "base"]).default("solana"),
  apiKey: z.string().optional().nullable(),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(): Config {
  const walletType = process.env.ONELY_WALLET_TYPE;
  const walletKey = process.env.ONELY_WALLET_KEY;
  const walletSolana = process.env.ONELY_WALLET_SOLANA_KEY || null;
  const walletEvm = process.env.ONELY_WALLET_EVM_KEY || null;
  const apiKeyEnv = process.env.ONELY_API_KEY || null;
  const apiBase = process.env.ONELY_API_BASE || "https://1ly.store";

  // Parse and validate budget values to prevent NaN/negative bypasses
  const perCallRaw = process.env.ONELY_BUDGET_PER_CALL || "1.0";
  const dailyRaw = process.env.ONELY_BUDGET_DAILY || "50.0";

  const perCall = parseFloat(perCallRaw);
  const daily = parseFloat(dailyRaw);

  // Validate parsed values are valid positive numbers
  if (!Number.isFinite(perCall) || perCall <= 0) {
    logSecurityEvent("invalid_budget_config", {
      parameter: "ONELY_BUDGET_PER_CALL",
      value: perCallRaw,
      parsed: perCall,
    });
    throw new Error(
      `Invalid ONELY_BUDGET_PER_CALL: "${perCallRaw}" - must be a positive number`
    );
  }
  if (!Number.isFinite(daily) || daily <= 0) {
    logSecurityEvent("invalid_budget_config", {
      parameter: "ONELY_BUDGET_DAILY",
      value: dailyRaw,
      parsed: daily,
    });
    throw new Error(
      `Invalid ONELY_BUDGET_DAILY: "${dailyRaw}" - must be a positive number`
    );
  }

  let parsedConfig: Config;
  try {
    parsedConfig = ConfigSchema.parse({
      apiBase,
      wallet: walletType && walletKey ? { type: walletType, key: walletKey } : null,
      walletSolana: walletSolana || (walletType === "solana" ? walletKey : null),
      walletEvm: walletEvm || (walletType === "evm" ? walletKey : null),
      budgets: {
        perCall,
        daily,
      },
      network: process.env.ONELY_NETWORK || "solana",
      apiKey: apiKeyEnv,
    });
  } catch (err) {
    // Log API base violations
    if (err instanceof z.ZodError) {
      const apiBaseError = err.errors.find((e) => e.path[0] === "apiBase");
      if (apiBaseError) {
        logSecurityEvent("api_base_violation", {
          attempted: apiBase,
          error: apiBaseError.message,
        });
      }
    }
    throw err;
  }

  return parsedConfig;
}

export async function loadConfigWithStoredKey(): Promise<Config> {
  const config = loadConfig();
  if (config.apiKey) return config;
  const stored = await loadStoredApiKey();
  return { ...config, apiKey: stored };
}
