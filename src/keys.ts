import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import os from "node:os";

type StoredKeys = {
  apiKey?: string;
  updatedAt?: string;
  store?: {
    username?: string;
    createdBy?: string;
  };
};

export function getDefaultKeyPath(): string {
  const home = os.homedir();
  const platform = process.platform;
  if (platform === "darwin") {
    return join(home, "Library", "Application Support", "1ly", "onely_api_key.json");
  }
  if (platform === "win32") {
    const appData = process.env.APPDATA || join(home, "AppData", "Roaming");
    return join(appData, "1ly", "onely_api_key.json");
  }
  return join(home, ".config", "1ly", "onely_api_key.json");
}

export async function loadStoredApiKey(path = getDefaultKeyPath()): Promise<string | null> {
  try {
    const raw = await readFile(path, "utf-8");
    const data = JSON.parse(raw) as StoredKeys;
    return data.apiKey || null;
  } catch {
    return null;
  }
}

export async function saveApiKey(
  apiKey: string,
  store?: StoredKeys["store"],
  path = getDefaultKeyPath()
): Promise<string> {
  await mkdir(dirname(path), { recursive: true });
  const payload: StoredKeys = {
    apiKey,
    store,
    updatedAt: new Date().toISOString(),
  };
  await writeFile(path, JSON.stringify(payload, null, 2), "utf-8");

  if (process.platform !== "win32") {
    try {
      await import("node:fs/promises").then((fs) => fs.chmod(path, 0o600));
    } catch {
      // Best-effort; ignore chmod failures
    }
  }

  return path;
}
