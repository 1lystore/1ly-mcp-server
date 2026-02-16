import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

const IPC_DIR = "/tmp/payments-mcp-ui-bridge";
const REQUESTS_DIR = path.join(IPC_DIR, "requests");
const RESPONSES_DIR = path.join(IPC_DIR, "responses");

export interface AgenticWalletRequest {
  baseURL: string;
  path: string;
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  queryParams?: Record<string, string>;
  body?: unknown;
  headers?: Record<string, string>;
  maxAmountPerRequest?: number;
  paymentRequirements?: Array<Record<string, unknown>>;
}

type AgenticWalletResponse = {
  status: number;
  statusText?: string;
  data?: unknown;
  headers?: Record<string, string>;
};

function ensureIpcDirs(): void {
  if (!fs.existsSync(IPC_DIR)) fs.mkdirSync(IPC_DIR, { mode: 0o700 });
  if (!fs.existsSync(REQUESTS_DIR)) fs.mkdirSync(REQUESTS_DIR, { mode: 0o700 });
  if (!fs.existsSync(RESPONSES_DIR)) fs.mkdirSync(RESPONSES_DIR, { mode: 0o700 });
}

async function waitForResponseFile(filePath: string, timeoutMs: number): Promise<void> {
  if (fs.existsSync(filePath)) return;
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      watcher.close();
      reject(new Error("Agentic Wallet IPC timeout"));
    }, timeoutMs);

    const watcher = fs.watch(RESPONSES_DIR, (eventType, filename) => {
      if (filename === path.basename(filePath)) {
        clearTimeout(timeout);
        watcher.close();
        resolve();
      }
    });
  });
}

async function sendAgenticIpcRequest<T>(
  channel: string,
  data: unknown,
  timeoutMs: number
): Promise<T> {
  ensureIpcDirs();

  const originalTitle = process.title;
  process.title = "awal-cli";

  const requestId = randomUUID();
  const requestFile = path.join(REQUESTS_DIR, `${requestId}.json`);
  const responseFile = path.join(RESPONSES_DIR, `${requestId}.json`);

  try {
    const payload = {
      id: requestId,
      channel,
      data,
      timestamp: Date.now(),
      pid: process.pid,
      processTitle: process.title,
    };

    fs.writeFileSync(requestFile, JSON.stringify(payload, null, 2), { mode: 0o600 });

    await waitForResponseFile(responseFile, timeoutMs);

    const responseData = fs.readFileSync(responseFile, "utf-8");
    const response = JSON.parse(responseData) as {
      result?: T;
      error?: string | object;
    };

    try {
      fs.unlinkSync(responseFile);
    } catch {
      // ignore cleanup errors
    }

    if (response.error) {
      const message =
        typeof response.error === "string" ? response.error : JSON.stringify(response.error);
      throw new Error(message);
    }

    if (!response.result) {
      throw new Error("Agentic Wallet IPC returned empty result");
    }

    return response.result;
  } finally {
    process.title = originalTitle;
  }
}

export async function makeX402RequestViaAgenticWallet(
  request: AgenticWalletRequest,
  timeoutMs = 30_000
): Promise<AgenticWalletResponse> {
  return sendAgenticIpcRequest<AgenticWalletResponse>(
    "make-x402-request",
    request,
    timeoutMs
  );
}

export async function getAgenticWalletAddress(
  timeoutMs = 30_000
): Promise<string> {
  const result = await sendAgenticIpcRequest<unknown>(
    "get-wallet-address",
    undefined,
    timeoutMs
  );

  if (typeof result === "string") return result;
  if (
    result &&
    typeof result === "object" &&
    "address" in result &&
    typeof (result as { address?: unknown }).address === "string"
  ) {
    return (result as { address: string }).address;
  }

  throw new Error("Agentic Wallet returned an invalid address");
}
