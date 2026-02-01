import { z } from "zod";
import { loadStoredApiKey } from "./keys.js";

export const ConfigSchema = z.object({
  apiBase: z.string().url().default("https://1ly.store"),
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
    perCall: z.number().positive().default(1.0),
    daily: z.number().positive().default(50.0),
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

  return ConfigSchema.parse({
    apiBase,
    wallet: walletType && walletKey ? { type: walletType, key: walletKey } : null,
    walletSolana: walletSolana || (walletType === "solana" ? walletKey : null),
    walletEvm: walletEvm || (walletType === "evm" ? walletKey : null),
    budgets: {
      perCall: parseFloat(process.env.ONELY_BUDGET_PER_CALL || "1.0"),
      daily: parseFloat(process.env.ONELY_BUDGET_DAILY || "50.0"),
    },
    network: process.env.ONELY_NETWORK || "solana",
    apiKey: apiKeyEnv,
  });
}

export async function loadConfigWithStoredKey(): Promise<Config> {
  const config = loadConfig();
  if (config.apiKey) return config;
  const stored = await loadStoredApiKey();
  return { ...config, apiKey: stored };
}
